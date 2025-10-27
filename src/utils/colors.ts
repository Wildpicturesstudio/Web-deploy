export function categoryColors(n: number): string[] {
  const palette = [
    '#D4AF37', // secondary (gold)
    '#121212', // primary (black)
    '#8884d8',
    '#82ca9d',
    '#ff7300',
    '#00c49f',
    '#ffbb28',
    '#0088fe',
    '#a28cff',
    '#ff6f91',
  ];
  return Array.from({ length: n }, (_, i) => palette[i % palette.length]);
}

export default categoryColors;
