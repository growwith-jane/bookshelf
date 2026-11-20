// api/cover.js
// 표지 그림 중계 함수
//   /api/cover?u=https://search1.kakaocdn.net/...  → 같은 그림을 우리 주소로 돌려준다
//
// 카카오 표지 서버는 다른 사이트가 그림을 가져다 쓰는 걸 막아둬서,
// 완독 인증 카드를 이미지로 저장할 때 표지가 들어가지 않는다.
// 우리 서버가 대신 받아서 넘겨주면 같은 출처의 그림이 되어 저장본에도 들어간다.
//
// 아무 주소나 받아주면 남의 트래픽을 대신 내주는 꼴이 되므로,
// 책 표지가 올라오는 곳만 허용한다.

const ALLOWED = ['kakaocdn.net', 'daumcdn.net'];

export default async function handler(req, res) {
  const { u } = req.query;

  if (!u) {
    return res.status(400).json({ error: '그림 주소(u)가 필요합니다.' });
  }

  let url;
  try {
    url = new URL(u);
  } catch {
    return res.status(400).json({ error: '올바른 주소가 아닙니다.' });
  }

  const okHost =
    url.protocol === 'https:' &&
    ALLOWED.some((d) => url.hostname === d || url.hostname.endsWith('.' + d));

  if (!okHost) {
    return res.status(403).json({ error: '허용하지 않는 주소입니다.' });
  }

  try {
    const r = await fetch(url.toString());

    if (!r.ok) {
      return res.status(502).json({ error: '표지를 받지 못했습니다.', code: r.status });
    }

    const type = r.headers.get('content-type') || '';
    if (!type.startsWith('image/')) {
      return res.status(502).json({ error: '그림이 아닙니다.', detail: type });
    }

    const buf = Buffer.from(await r.arrayBuffer());

    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 's-maxage=604800, stale-while-revalidate');
    res.setHeader('Access-Control-Allow-Origin', '*');

    return res.status(200).send(buf);
  } catch (err) {
    return res.status(500).json({ error: '표지 중계 실패', detail: String(err) });
  }
}
