export function mentionsSecret(text: string, key: string, value: string): boolean;
export function mentionsDetail(text: string, detail: string): boolean;
export function tokenize(text: string): string[];
export function numberRuns(text: string): string[][];
export function runsMatch(runs: string[][], targets: string[]): boolean;
export function digitsOf(value: string): string;
export function alnumOf(value: string): string;
export function dateTargets(iso: string): string[];
export function addressParts(address: string): { number: string; street: string } | null;
