export const d = (sides: number) => 1 + Math.floor(Math.random() * sides)
export const roll = (n: number, sides: number) => Array.from({ length: n }, () => d(sides))
export const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)
