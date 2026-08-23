// api/book.js
// 알라딘 OpenAPI 중계 함수
//   /api/book?q=패권         → 제목 검색 (후보 목록)
//   /api/book?isbn13=978...  → ISBN 상세 조회 (쪽수 포함)
//   /api/book?debug=1        → 환경변수 진단 (값은 노출하지 않음)

const BASE = 'https://www.aladin.co.kr/ttb/api';

export default async function handler(req, res) {
  const TTB = process.env.ALADIN_TTB_KEY;
  const { q, isbn13, debug } = req.query;

  // 진단 모드: 키 값은 절대 출력하지 않고, 존재 여부와 길이만 확인
  if (debug) {
    const related = Object.keys(process.env).filter(
      (k) => k.includes('ALADIN') || k.includes('TTB')
    );
    return res.status(200).json({
      키가_보이는가: Boolean(TTB),
      키_길이: TTB ? TTB.length : 0,
      비슷한_이름의_변수들: related,
      배포환경: process.env.VERCEL_ENV || '알 수 없음',
      배포지역: process.env.VERCEL_REGION || '알 수 없음',
    });
  }

  if (!TTB) {
    return res.status(500).json({
      error: 'TTB 키가 설정되지 않았습니다. Vercel 환경변수를 확인하세요.',
    });
  }

  if (!q && !isbn13) {
    return res.status(400).json({ error: '검색어(q) 또는 isbn13이 필요합니다.' });
  }

  try {
    const key = TTB.trim();

    const url = isbn13
      ? `${BASE}/ItemLookUp.aspx?ttbkey=${key}` +
        `&itemIdType=ISBN13&ItemId=${encodeURIComponent(isbn13)}` +
        `&Cover=Big&OptResult=packing&output=js&Version=20131101`
      : `${BASE}/ItemSearch.aspx?ttbkey=${key}` +
        `&Query=${encodeURIComponent(q)}&QueryType=Title&SearchTarget=Book` +
        `&MaxResults=5&start=1&Cover=Big&output=js&Version=20131101`;

    const response = await fetch(url);
    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(502).json({
        error: '알라딘 응답을 읽을 수 없습니다.',
        detail: text.slice(0, 200),
      });
    }

    if (data.errorCode) {
      return res.status(502).json({
        error: '알라딘 API 오류',
        code: data.errorCode,
        detail: data.errorMessage,
      });
    }

    const items = data.item || [];

    const books = items.map((b) => ({
      title: cleanTitle(b.title),
      author: cleanAuthor(b.author),
      publisher: b.publisher || '',
      isbn13: b.isbn13 || b.isbn || '',
      cover: (b.cover || '').replace('/coversum/', '/cover500/'),
      pubDate: b.pubDate || '',
      totalPages: b.subInfo?.itemPage || null,
      link: b.link || '',
    }));

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');

    return res.status(200).json(isbn13 ? books[0] || null : books);
  } catch (err) {
    return res.status(500).json({ error: '요청 처리 실패', detail: String(err) });
  }
}

function cleanTitle(title = '') {
  return title.split(' - ')[0].trim();
}

function cleanAuthor(author = '') {
  return author
    .split(',')[0]
    .replace(/\s*\((지은이|옮긴이|엮은이|저자|글|그림)\)/g, '')
    .trim();
}
