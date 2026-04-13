export function test(text: string) {
  return text.replace(new RegExp("\u0000", "g"), "");
}
