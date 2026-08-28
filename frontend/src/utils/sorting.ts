/**
 * Righe più recenti prima, indipendentemente dall'ordine restituito dal
 * backend. Non tronca: il chiamante applica il proprio limite di
 * visualizzazione e calcola "N more" sul totale reale — troncare qui a
 * monte falsava quel conteggio (es. "15 more" su un totale di 200 invece
 * di "195 more").
 *
 * A parità di timestamp (il backend logga più eventi nello stesso secondo)
 * l'ordine originale — che è per inserimento crescente — va invertito
 * esplicitamente: Array.sort è stabile, quindi senza il tie-break
 * sull'indice originale i pari-merito resterebbero nell'ordine di
 * inserimento, mostrando il più vecchio del gruppo invece del più recente.
 */
export function mostRecentFirst<T extends { timestamp: string }>(rows: T[]): T[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const byTime = new Date(b.row.timestamp).getTime() - new Date(a.row.timestamp).getTime()
      return byTime !== 0 ? byTime : b.index - a.index
    })
    .map(({ row }) => row)
}
