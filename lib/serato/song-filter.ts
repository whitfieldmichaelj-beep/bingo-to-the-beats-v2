/** DJ edits excluded from bingo cards, shared by preview and game creation. */
export function excludedDjSong(title: string, fileName = ""): boolean {
  const text = `${title} ${fileName}`.normalize("NFKC").replace(/_/g, " ");
  return /\ba[\s-]*cap{1,2}ella\b|\binstrumental\b|\bintro[\s./\\-]*outro\b/i.test(text);
}
