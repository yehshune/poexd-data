import * as fs from 'fs/promises';
import * as path from 'path';
import { PoeDataLoader } from '../cdn/loader.js';

export function cleanMarkup(text: string | null | undefined): string {
  if (!text) return '';
  // 1. 標準 [Tag|Display] -> Display
  let s = text.replace(/\[[^|\]]+\|([^\]]+)\]/g, '$1');
  // 2. 缺少 | 分隔線之標籤 (英文 Tag 緊接非 ASCII 翻譯文字，如 [ContainsDelirium譫妄之鏡] -> 譫妄之鏡)
  s = s.replace(/\[[A-Za-z0-9_]+([^\x00-\x7f][^\]]*)\]/g, '$1');
  // 3. 一般 [Display] -> Display
  s = s.replace(/\[([^\]]+)\]/g, '$1');
  return s.trim();
}

export const SPECIAL_CONTENT: Record<string, any> = {
  '1000': {
    name: 'Corruption',
    icon: 'AtlasIconContentCorruption',
    desc: 'This map is Corrupted.',
    translates: {
      'traditional chinese': {
        name: '腐化',
        desc: '此地圖已被腐化。'
      }
    }
  },
  '1002': {
    name: 'Delirium Fog',
    icon: 'AtlasIconContentDelirium',
    desc: 'Players in area are Delirious.',
    translates: {
      'traditional chinese': {
        name: '譫妄迷霧',
        desc: '區域內的玩家受到譫妄籠罩。'
      }
    }
  },
  '1003': {
    name: 'Cleansed',
    icon: 'AtlasIconContentSanctification',
    desc: 'Area has been Cleansed.',
    translates: {
      'traditional chinese': {
        name: '已淨化',
        desc: '區域已淨化。'
      }
    }
  },
  '1004': {
    name: 'Wandering Trader',
    icon: 'AtlasIconContentTrader',
    desc: 'Area contains a Wandering Trader.',
    translates: {
      'traditional chinese': {
        name: '流浪商人',
        desc: '區域含有一位流浪商人。'
      }
    }
  },
  '1005': {
    name: 'Corrupted Nexus',
    icon: 'AtlasIconContentCorruptionNexus',
    desc: 'Area contains a Corrupted Boss.',
    translates: {
      'traditional chinese': {
        name: '腐化樞紐',
        desc: '區域含有一個腐化頭目。'
      }
    }
  },
  '1006': {
    name: 'Deadly Map Boss',
    icon: 'AtlasIconContentMapBossSpecial',
    desc: 'Area contains a Deadly Map Boss.',
    translates: {
      'traditional chinese': {
        name: '致命地圖頭目',
        desc: '區域含有一個致命地圖頭目。'
      }
    }
  },
  '1007': {
    name: 'Grand Mirror',
    icon: 'AtlasIconContentGigaMirror',
    desc: 'Contains a reflection of the Map Boss. When the bosses are defeated Delirium fog spreads to nearby Maps.',
    translates: {
      'traditional chinese': {
        name: '宏偉之鏡',
        desc: '包含地圖頭目的倒影；擊敗頭目後，譫妄迷霧會擴散到鄰近地圖。'
      }
    }
  }
};

export async function buildAtlasContent(
  loader: PoeDataLoader,
  outputPath = path.join(process.cwd(), 'output', 'atlas_content.json')
): Promise<Record<string, any>> {
  console.log('[AtlasContent] 載入 EndgameMapContent (英文 & 繁體中文)...');
  const tblEn = await loader.loadTable('EndgameMapContent');
  const tblZh = await loader.loadTable('EndgameMapContent', { language: 'Traditional Chinese' });

  // 載入 VisualIdentity (用於獲取 AtlasIcon)
  const visualIdentityTbl = await loader.loadTable('EndgameMapContentVisualIdentity');

  console.log(`[AtlasContent] 拼裝資料 (共 ${tblEn.length} 筆原生機制)...`);
  const result: Record<string, any> = {};

  for (let idx = 0; idx < tblEn.length; idx++) {
    const rowEn = tblEn[idx];
    const rowZh = tblZh[idx] ?? null;
    const key = String(100 + idx);

    const nameEn = rowEn.Name || '';
    const descEn = cleanMarkup(rowEn.Description);

    let icon = '';
    const visKey = rowEn.VisualIdentity;
    if (visKey != null && visualIdentityTbl[visKey]) {
      const vis = visualIdentityTbl[visKey];
      const rawIcon = vis.AtlasIcon || vis.PassiveArt;
      if (rawIcon) {
        icon = path.basename(rawIcon).replace(/\.(dds|png)$/, '');
      }
    }

    if (rowEn.Id === 'Simulacrum' && (!icon || icon === 'DeliriumNotable7')) {
      icon = 'AtlasIconContentDelirium';
    }

    const nameZh = (rowZh?.Name) || nameEn;
    const descZh = rowZh ? cleanMarkup(rowZh.Description) : descEn;

    result[key] = {
      name: nameEn,
      icon,
      desc: descEn,
      translates: {
        'traditional chinese': {
          name: nameZh,
          desc: descZh
        }
      }
    };
  }

  // 合併特殊與動態狀態項目
  for (const [k, v] of Object.entries(SPECIAL_CONTENT)) {
    result[k] = v;
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`[AtlasContent] 已寫入: ${outputPath} (共 ${Object.keys(result).length} 筆)`);
  return result;
}
