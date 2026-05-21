/** 월간 마법사에서 선택하는 도서 — 개발 서버에서는 YES24 실검색 결과로도 채워짐 */
export type MockBook = {
  id: string;
  /** Supabase·로컬 books.id (저장 시 m_reports.book_id1 등에 연결) */
  db_book_id?: string | null;
  title: string;
  author: string;
  publisher: string;
  url?: string;
  cover_url?: string | null;
  category?: string | null;
  introduce?: string | null;
  author_cmt?: string | null;
  pub_cmt?: string | null;
  ai_category?: string | null;
  ai_keywords?: string[];
};

export const MOCK_BOOKS: MockBook[] = [
  { id: "m1", title: "마음의 온도", author: "김지혜", publisher: "문학동네" },
  { id: "m2", title: "책 읽는 어린이", author: "박서연", publisher: "비룡소" },
  { id: "m3", title: "생각이 자라는 하루", author: "이한결", publisher: "창비" },
  { id: "m4", title: "토론의 기술", author: "최민준", publisher: "21세기북스" },
  { id: "m5", title: "글쓰기가 즐거워지는 이야기", author: "정수빈", publisher: "사계절" },
  { id: "m6", title: "질문하는 아이", author: "한소율", publisher: "웅진주니어" },
  { id: "m7", title: "논술 첫걸음", author: "오지훈", publisher: "길벗" },
  { id: "m8", title: "독서록 쓰기 연습", author: "윤다은", publisher: "키즈엠" },
  { id: "m9", title: "함께 읽는 고전", author: "강유진", publisher: "민음사" },
  { id: "m10", title: "스스로 정리하는 공부법", author: "서태양", publisher: "다산어린이" },
];

/** 제목·저자·출판사로 목업 DB 검색 (프로덕션 빌드 미리보기) */
export function searchMockBooksByTitle(query: string): MockBook[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return MOCK_BOOKS.filter(
    (b) =>
      b.title.toLowerCase().includes(q) ||
      b.author.toLowerCase().includes(q) ||
      b.publisher.toLowerCase().includes(q),
  ).slice(0, 20);
}

export function filterMockBooks(query: string): MockBook[] {
  const q = query.trim().toLowerCase();
  if (!q) return MOCK_BOOKS;
  return MOCK_BOOKS.filter(
    (b) =>
      b.title.toLowerCase().includes(q) ||
      b.author.toLowerCase().includes(q) ||
      b.publisher.toLowerCase().includes(q),
  );
}

/** 도서명·출판사·저자 또는 역자(한 칸)로 목업 검색 — Yes24 연동 시 교체 */
export function searchMockBooks(params: {
  title: string;
  publisher: string;
  /** 저자 또는 역자 — 둘 중 검색할 한 명만 입력 */
  authorOrTranslator: string;
}): MockBook[] {
  const title = params.title.trim().toLowerCase();
  const publisher = params.publisher.trim().toLowerCase();
  const personQ = params.authorOrTranslator.trim().toLowerCase();

  if (!title || !publisher || !personQ) return [];

  return MOCK_BOOKS.filter((b) => {
    if (!b.title.toLowerCase().includes(title)) return false;
    if (!b.publisher.toLowerCase().includes(publisher)) return false;
    return b.author.toLowerCase().includes(personQ);
  });
}
