// api/book.js
// 카카오 책 검색(다음 책) 중계 함수
//   /api/book?q=패권         → 제목 검색 (후보 목록)
//   /api/book?isbn13=978...  → ISBN 조회 (한 권)
//
// 2026-11 알라딘 OpenAPI 서비스가 종료되어 카카오로 바꿨다.
// 카카오는 쪽수를 주지 않아서 totalPages 는 항상 null — 앱에서 직접 입력받는다.

const BASE = 'https://dapi.kakao.com/v3/search/book';

export default async function handler(req, res) {
  const KEY = process.env.KAKAO_REST_KEY;
  const { q, isbn13 } = req.query;

  if (!KEY) {
    return res.status(500).json({
      error: 'KAKAO_REST_KEY 가 설정되지 않았습니다. Vercel 환경변수를 확인하세요.',
    });
  }

  if (!q && !isbn13) {
    return res.status(400).json({ error: '검색어(q) 또는 isbn13이 필요합니다.' });
  }

  try {
    const params = isbn13
      ? `query=${encodeURIComponent(isbn13)}&target=isbn&size=1`
      : `query=${encodeURIComponent(q)}&target=title&size=5`;

    const response = await fetch(`${BASE}?${params}`, {
      headers: { Authorization: `KakaoAK ${KEY.trim()}` },
    });

    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(502).json({
        error: '카카오 응답을 읽을 수 없습니다.',
        detail: text.slice(0, 200),
      });
    }

    if (!response.ok) {
      return res.status(502).json({
        error: '카카오 API 오류',
        code: response.status,
        detail: data.message || data.errorType || '',
      });
    }

    const items = data.documents || [];
    const books = items.map(toBook);

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');

    return res.status(200).json(isbn13 ? books[0] || null : books);
  } catch (err) {
    return res.status(500).json({ error: '요청 처리 실패', detail: String(err) });
  }
}

/* 카카오 응답을 앱이 쓰던 모양 그대로 바꿔준다 (알라딘 때와 같은 필드) */
function toBook(d) {
  return {
    title: cleanTitle(d.title || ''),
    author: cleanAuthor(d.authors),
    publisher: d.publisher || '',
    isbn13: pickIsbn13(d.isbn),
    cover: d.thumbnail || '',
    pubDate: (d.datetime || '').slice(0, 10),
    totalPages: null, // 카카오는 쪽수를 주지 않는다
    link: d.url || '',
  };
}

function cleanTitle(title) {
  return title.split(' - ')[0].trim();
}

/* 저자가 여럿이면 첫 명만, 없으면 빈 값 */
function cleanAuthor(authors) {
  if (!Array.isArray(authors) || !authors.length) return '';
  return String(authors[0]).trim();
}

/* isbn 은 "ISBN10 ISBN13" 처럼 공백으로 붙어 올 수 있다 — 13자리만 고른다 */
function pickIsbn13(isbn) {
  if (!isbn) return '';
  const parts = String(isbn).trim().split(/\s+/);
  const found = parts.find((p) => p.replace(/-/g, '').length === 13);
  return (found || parts[parts.length - 1] || '').replace(/-/g, '');
}
