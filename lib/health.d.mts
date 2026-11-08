export function getHealth(env?: NodeJS.ProcessEnv): Promise<{ database: boolean; nvidia: boolean; elevenlabs: boolean }>;
