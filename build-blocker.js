const { ElectronBlocker } = require('@ghostery/adblocker-electron');
const fetch = require('cross-fetch');
const fs = require('fs');

async function build() {
    console.log('Начинаю сборку adblocker.bin с поддержкой YouTube...');

    // Расширенный список фильтров, содержащий скриптлеты и правила для YT
    const blocker = await ElectronBlocker.fromLists(fetch, [
        'https://easylist.to/easylist/easylist.txt',
        'https://easylist.to/easylist/easyprivacy.txt',
        'https://easylist-downloads.adblockplus.org/ruadlist+easylist.txt',
        // Дополнительные фильтры против рекламы в плеере YouTube:
        'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/quick-fixes.txt',
        'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt',
        'https://filters.adtidy.org/extension/ublock/filters/2.txt' // AdGuard Base
    ]);

    const buffer = blocker.serialize();
    fs.writeFileSync('adblocker.bin', Buffer.from(buffer));

    console.log(`Готово! Файл adblocker.bin создан.`);
    console.log(`Размер: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);
}

build().catch(err => console.error('Ошибка сборки:', err));
