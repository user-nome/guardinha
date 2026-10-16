/**
 * Atribuições por dependência (dados, não UI): não se traduzem, conforme
 * `docs/messages.md`. Título, dica e rodapé ficam em `src/messages/`.
 */
export interface Attribution {
  role: string;
  name: string;
}

export const DEPENDENCIES: readonly Attribution[] = [
  { role: 'DESENVOLVIMENTO & CONCEITO', name: 'Chronos Atalante' },
  { role: 'SISTEMA OPERACIONAL ALVO', name: 'Linux Mint 22.X (Zena)' },
  { role: 'INTERFACE & FRAMEWORK', name: 'Electron + React + TypeScript' },
  { role: 'ESTILIZAÇÃO VISUAL', name: 'Tailwind CSS & Lucide Icons' },
  { role: 'MOTOR DE CRIPTOGRAFIA', name: 'Node.js Crypto (AES-256-GCM / Argon2id)' },
  { role: 'GERENCIAMENTO LOCAL DE ARQUIVOS', name: 'FS-Extra & Native Linux Filesystem' },
];
