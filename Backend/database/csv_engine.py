import logging
import re
from typing import List, Dict, Any, Optional
import pandas as pd

logger = logging.getLogger(__name__)

class CSVSearchEngine:
    """
    Search Engine dành riêng cho dataset Goodreadss Books.csv.
    Tối ưu hóa In-memory Caching, Chuẩn hóa dữ liệu văn bản và cung cấp các Tool tìm kiếm chuyên biệt.
    """

    def __init__(self):
        self.df: Optional[pd.DataFrame] = None
        self._is_loaded: bool = False

    def load_data(self, file_path: str = "data/Goodreadss Books.csv") -> None:
        """
        Load dữ liệu CSV vào Memory một lần duy nhất khi Server Startup.
        Tiền xử lý, chuẩn hóa các cột văn bản và số học.
        """
        try:
            logger.info(f"Loading CSV Database from: {file_path}...")
            
            # 1. Đọc file CSV
            df_raw = pd.read_csv(file_path)

            # Drop cột Unnamed index nếu có
            if 'Unnamed: 0' in df_raw.columns:
                df_raw.drop(columns=['Unnamed: 0'], inplace=True)

            # 2. Chuẩn hóa các cột Text
            text_columns = [
                'title', 'author', 'series', 'description', 
                'genres', 'awards', 'characters', 'places', 
                'language', 'isbn', 'isbn13'
            ]
            for col in text_columns:
                if col in df_raw.columns:
                    df_raw[col] = df_raw[col].fillna("").astype(str).str.strip()
                else:
                    df_raw[col] = ""

            # 3. Chuẩn hóa các cột Số (Numeric)
            numeric_cols = [
                'num_pages', 'num_ratings', 'num_reviews', 
                'avg_rating', 'rated_1', 'rated_2', 'rated_3', 'rated_4', 'rated_5'
            ]
            for col in numeric_cols:
                if col in df_raw.columns:
                    df_raw[col] = pd.to_numeric(df_raw[col], errors='coerce').fillna(0)
                else:
                    df_raw[col] = 0.0

            # 4. Tạo các cột Normalized (Viết thường để search nhanh hơn)
            df_raw['title_norm'] = df_raw['title'].str.lower()
            df_raw['author_norm'] = df_raw['author'].str.lower()
            df_raw['series_norm'] = df_raw['series'].str.lower()
            df_raw['genres_norm'] = df_raw['genres'].str.lower()
            df_raw['characters_norm'] = df_raw['characters'].str.lower()
            df_raw['places_norm'] = df_raw['places'].str.lower()
            df_raw['awards_norm'] = df_raw['awards'].str.lower()

            # 5. Tạo Unified Search Index phục vụ Hybrid Search / Keyword Search
            df_raw['search_index'] = (
                df_raw['title_norm'] + " " +
                df_raw['author_norm'] + " " +
                df_raw['series_norm'] + " " +
                df_raw['genres_norm'] + " " +
                df_raw['characters_norm'] + " " +
                df_raw['places_norm'] + " " +
                df_raw['awards_norm'] + " " +
                df_raw['description'].str.lower()
            )

            self.df = df_raw
            self._is_loaded = True
            logger.info(f"Loaded {len(self.df)} books successfully into memory cache.")

        except Exception as e:
            logger.error(f"Failed to load CSV file: {e}")
            raise e

    def _format_records(self, records: List[Dict[str, Any]], max_desc_len: int = 500) -> List[Dict[str, Any]]:
        """Format lại kết quả tìm kiếm ngắn gọn, đủ thông tin để gửi sang Prompt Context Builder."""
        results = []
        for r in records:
            desc = r.get("description", "")
            if len(desc) > max_desc_len:
                desc = desc[:max_desc_len] + "..."

            results.append({
                "bookId": r.get("bookId"),
                "title": r.get("title"),
                "author": r.get("author"),
                "series": r.get("series") if r.get("series") else "N/A",
                "genres": r.get("genres"),
                "avg_rating": float(r.get("avg_rating", 0.0)),
                "num_ratings": int(r.get("num_ratings", 0)),
                "num_reviews": int(r.get("num_reviews", 0)),
                "num_pages": int(r.get("num_pages", 0)),
                "language": r.get("language"),
                "publish_date": r.get("publish_date") or r.get("first_publish_date") or "N/A",
                "characters": r.get("characters") if r.get("characters") else "N/A",
                "places": r.get("places") if r.get("places") else "N/A",
                "awards": r.get("awards") if r.get("awards") else "N/A",
                "description": desc
            })
        return results

    # =========================================================================
    # DETAILED TOOLS / SEARCH METHODS
    # =========================================================================

    def query_by_title(self, title: str, limit: int = 5, lang_filter: str = "English") -> List[Dict[str, Any]]:
        """Tool 1: Tìm kiếm theo tên sách (Partial Match & Priority High Rating/Ratings Count)."""
        if not self._is_loaded or not title.strip():
            return []
        
        query = title.lower().strip()
        matched = self.df[self.df['title_norm'].str.contains(query, regex=False, na=False)]
        
        if lang_filter and 'language' in matched.columns:
            english_matched = matched[matched['language'].str.lower() == lang_filter.lower()]
            if not english_matched.empty:
                matched = english_matched

        matched = matched.sort_values(by=['num_ratings', 'avg_rating'], ascending=[False, False])
        return self._format_records(matched.head(limit).to_dict('records'))

    def query_by_author(self, author: str, limit: int = 5) -> List[Dict[str, Any]]:
        """Tool 2: Tìm kiếm theo tên tác giả."""
        if not self._is_loaded or not author.strip():
            return []
        
        query = author.lower().strip()
        matched = self.df[self.df['author_norm'].str.contains(query, regex=False, na=False)]
        matched = matched.sort_values(by=['avg_rating', 'num_ratings'], ascending=[False, False])
        return self._format_records(matched.head(limit).to_dict('records'))

    def query_by_genre(self, genre: str, limit: int = 5) -> List[Dict[str, Any]]:
        """Tool 3: Tìm kiếm theo thể loại (Genre)."""
        if not self._is_loaded or not genre.strip():
            return []
        
        query = genre.lower().strip()
        matched = self.df[self.df['genres_norm'].str.contains(query, regex=False, na=False)]
        matched = matched.sort_values(by=['avg_rating', 'num_ratings'], ascending=[False, False])
        return self._format_records(matched.head(limit).to_dict('records'))

    def query_by_character(self, character_name: str, limit: int = 5) -> List[Dict[str, Any]]:
        """Tool 4: Tìm kiếm các sách có chứa nhân vật cụ thể."""
        if not self._is_loaded or not character_name.strip():
            return []
        
        query = character_name.lower().strip()
        matched = self.df[self.df['characters_norm'].str.contains(query, regex=False, na=False)]
        matched = matched.sort_values(by='num_ratings', ascending=False)
        return self._format_records(matched.head(limit).to_dict('records'))

    def query_by_place(self, place_name: str, limit: int = 5) -> List[Dict[str, Any]]:
        """Tool 5: Tìm kiếm các sách có bối cảnh/địa danh cụ thể."""
        if not self._is_loaded or not place_name.strip():
            return []
        
        query = place_name.lower().strip()
        matched = self.df[self.df['places_norm'].str.contains(query, regex=False, na=False)]
        matched = matched.sort_values(by='num_ratings', ascending=False)
        return self._format_records(matched.head(limit).to_dict('records'))

    def query_by_award(self, award_name: str, limit: int = 5) -> List[Dict[str, Any]]:
        """Tool 6: Tìm kiếm các sách đoạt giải thưởng cụ thể."""
        if not self._is_loaded or not award_name.strip():
            return []
        
        query = award_name.lower().strip()
        matched = self.df[self.df['awards_norm'].str.contains(query, regex=False, na=False)]
        matched = matched.sort_values(by='avg_rating', ascending=False)
        return self._format_records(matched.head(limit).to_dict('records'))

    def query_by_series(self, series_name: str, limit: int = 5) -> List[Dict[str, Any]]:
        """Tool 7: Tìm kiếm các sách thuộc bộ truyện (Series) cụ thể."""
        if not self._is_loaded or not series_name.strip():
            return []
        
        query = series_name.lower().strip()
        matched = self.df[self.df['series_norm'].str.contains(query, regex=False, na=False)]
        matched = matched.sort_values(by='title', ascending=True)
        return self._format_records(matched.head(limit).to_dict('records'))

    def get_book_by_id(self, book_id: Any) -> Optional[Dict[str, Any]]:
        """Tool 8: Truy vấn chính xác 1 cuốn sách theo bookId."""
        if not self._is_loaded:
            return None
        
        matched = self.df[self.df['bookId'].astype(str) == str(book_id)]
        if matched.empty:
            return None
        
        return self._format_records(matched.to_dict('records'))[0]

    def recommend_books(
        self, 
        genre: str = "", 
        author: str = "", 
        min_rating: float = 4.0, 
        keyword: str = "",
        limit: int = 5
    ) -> List[Dict[str, Any]]:
        """Tool 9: Recommendation Engine - Đề xuất sách dựa trên tiêu chí đa dạng."""
        if not self._is_loaded:
            return []
        
        temp_df = self.df.copy()

        # Áp dụng bộ lọc rating tối thiểu
        temp_df = temp_df[temp_df['avg_rating'] >= min_rating]

        if genre:
            temp_df = temp_df[temp_df['genres_norm'].str.contains(genre.lower().strip(), regex=False, na=False)]

        if author:
            temp_df = temp_df[temp_df['author_norm'].str.contains(author.lower().strip(), regex=False, na=False)]

        if keyword:
            temp_df = temp_df[temp_df['search_index'].str.contains(keyword.lower().strip(), regex=False, na=False)]

        temp_df = temp_df.sort_values(by=['avg_rating', 'num_ratings'], ascending=[False, False])
        return self._format_records(temp_df.head(limit).to_dict('records'))

    def hybrid_search(self, user_query: str, limit: int = 5) -> List[Dict[str, Any]]:
        """
        Tool 10: Multi-field Keyword Matching Search.
        Dùng khi không thể phân tách chính xác câu hỏi của user là thuộc tiêu chí nào.
        """
        if not self._is_loaded or not user_query.strip():
            return []

        # Tách các từ khóa chính
        cleaned_query = re.sub(r'[^\w\s]', '', user_query.lower().strip())
        tokens = [t for t in cleaned_query.split() if len(t) > 2]

        if not tokens:
            return []

        # Tìm kiếm dựa trên sự xuất hiện của từ khóa trong Search Index
        condition = pd.Series(True, index=self.df.index)
        for token in tokens:
            condition = condition & self.df['search_index'].str.contains(token, regex=False, na=False)

        matched = self.df[condition]

        # Sub-fallback: Nếu không match được tất cả từ khóa, match theo từng từ
        if matched.empty:
            pattern = '|'.join(tokens)
            matched = self.df[self.df['search_index'].str.contains(pattern, regex=True, na=False)]

        # Sắp xếp theo mức độ phổ biến & điểm đánh giá
        matched = matched.sort_values(by=['num_ratings', 'avg_rating'], ascending=[False, False])
        return self._format_records(matched.head(limit).to_dict('records'))


# Global Singleton instance
csv_engine = CSVSearchEngine()