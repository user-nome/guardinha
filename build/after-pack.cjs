'use strict';
// Hook afterPack do electron-builder: reduz o .deb removendo arquivos do
// Electron que o Guardinha não usa.
//
// - locales/: mantém só pt-BR, pt-PT e en-US (fallback obrigatório do Chromium).
// - SwiftShader/Vulkan (libvk_swiftshader.so, libvulkan.so.1,
//   vk_swiftshader_icd.json): o app é DOM/CSS estático (formulários React),
//   sem WebGL.
//
// NUNCA remover libffmpeg.so: o binário do Electron declara DT_NEEDED nele,
// então o loader exige o arquivo na hora do exec; sem ele o app morre
// instantaneamente ("error while loading shared libraries: libffmpeg.so")
// mesmo o app não usando áudio/vídeo.
//
// Se o app um dia precisar de WebGL, rever a lista abaixo.
// Exportado nos dois formatos (module.exports + .default) porque o
// electron-builder pode carregar o hook via require() ou import().
const fs = require('node:fs');
const path = require('node:path');

const KEEP_LOCALES = new Set(['en-US.pak', 'pt-BR.pak', 'pt-PT.pak']);

const REMOVE_FILES = ['libvk_swiftshader.so', 'libvulkan.so.1', 'vk_swiftshader_icd.json'];

// O que o app não pode perder no enxugamento. A conferência roda depois das
// remoções justamente para que uma entrada errada em REMOVE_FILES (ou no
// KEEP_LOCALES) quebre o build aqui, e não o app na máquina de quem instalou.
const REQUIRED_FILES = ['chrome-sandbox', 'libffmpeg.so', 'resources/app.asar'];

async function afterPack(context) {
  const dir = context.appOutDir;
  const removed = [];
  let freed = 0;

  const remove = (full, label) => {
    try {
      const { size } = fs.statSync(full);
      fs.rmSync(full, { recursive: true, force: true });
      freed += size;
      removed.push(label);
    } catch (error) {
      // Falha em apagar não invalida o pacote: só perde o enxugamento. Avisar
      // em vez de morrer mantém o build possível num filesystem sem suporte.
      console.warn(`[after-pack] não foi possível remover ${label}: ${error.message}`);
    }
  };

  // `locales/` existe desde o Electron 45. Se um dia a árvore mudar, o build
  // continua e só perde este enxugamento, em vez de falhar sem explicação.
  const localesDir = path.join(dir, 'locales');
  if (fs.existsSync(localesDir)) {
    for (const entry of fs.readdirSync(localesDir)) {
      if (!KEEP_LOCALES.has(entry)) {
        remove(path.join(localesDir, entry), `locales/${entry}`);
      }
    }
  } else {
    console.warn('[after-pack] locales/ não encontrado; nada a enxugar aqui');
  }

  for (const file of REMOVE_FILES) {
    const full = path.join(dir, file);
    if (fs.existsSync(full)) {
      remove(full, file);
    }
  }

  const executable = context.packager.executableName;
  for (const file of [...REQUIRED_FILES, executable]) {
    if (!fs.existsSync(path.join(dir, file))) {
      throw new Error(`[after-pack] arquivo obrigatório ausente no pacote: ${file}`);
    }
  }

  const megabytes = (freed / (1024 * 1024)).toFixed(1);
  console.log(
    `[after-pack] removidos ${removed.length} arquivos não usados do Electron (${megabytes} MiB)`,
  );
}

module.exports = afterPack;
module.exports.default = afterPack;
