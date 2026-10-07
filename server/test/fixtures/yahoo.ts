/** Réponse `/v8/finance/chart` minimale ; `points` en [date ISO, clôture]. */
export function chart(symbol: string, currency: string, points: [string, number | null][], live?: { date: string; price: number }) {
  const ts = (d: string) => Date.parse(`${d}T16:00:00Z`) / 1000;
  return {
    chart: {
      result: [
        {
          meta: {
            symbol, currency, longName: `${symbol} Inc.`, gmtoffset: 7200,
            regularMarketPrice: live?.price ?? points.at(-1)?.[1] ?? null,
            regularMarketTime: ts(live?.date ?? points.at(-1)![0]),
          },
          timestamp: points.map(([d]) => ts(d)),
          indicators: { quote: [{ close: points.map(([, c]) => c) }] },
        },
      ],
      error: null,
    },
  };
}

export const unknownTicker = { chart: { result: null, error: { code: 'Not Found', description: 'No data found' } } };

/** Faux `fetch` : associe un préfixe d'URL (ticker encodé) à un corps JSON ; compte les appels. */
export function fakeFetch(routes: Record<string, unknown>) {
  const calls: string[] = [];
  const fn = async (url: string) => {
    calls.push(url);
    const hit = Object.entries(routes).find(([k]) => url.includes(k));
    if (!hit) return new Response('{}', { status: 404 });
    if (hit[1] instanceof Error) throw hit[1];
    // Une `Response` explicite (p. ex. un code HTTP d'erreur) est renvoyée telle quelle.
    if (hit[1] instanceof Response) return hit[1];
    return new Response(JSON.stringify(hit[1]), { status: 200 });
  };
  return Object.assign(fn, { calls });
}
