import type { ActionOption, ContentDefinition, Ending } from '../../game/types';

type Place = 'fork' | 'entrance' | 'shrine' | 'return' | 'village';
type Item = 'sword' | 'bandage' | 'meat' | 'coat' | 'herb';
export type HeroState = {
  location: Place; minutes: number; injury: 'light' | 'worse'; treated: boolean;
  items: Item[]; observed: Place[]; bridgeKnown: boolean; covered: boolean;
  discoveries: string[]; ending: Ending | null;
};
const places: Record<Place, string> = { fork: '分かれ道', entrance: '祠の入口', shrine: '月白草の祠', return: '帰りの分かれ道', village: '村' };
const itemNames: Record<Item, string> = { sword: '剣', bandage: '包帯', meat: '干し肉', coat: '上着', herb: '月白草' };
const option = (id: string, label: string, cost: string): ActionOption => ({ id, label, cost });
const moveCost = (s: HeroState, base: number) => base + (s.injury === 'worse' && !s.treated ? 4 : 0);

function available(s: HeroState): ActionOption[] {
  if (s.ending) return [];
  const actions = [option('talk', '質問・相談（状態を変えない）', '0分'), option('abandon', '救援を待ち、旅を終える', '0分')];
  if (!s.observed.includes(s.location)) actions.push(option('observe', '周囲を詳しく調べる', '2分'));
  if (s.items.includes('bandage') && !s.treated) actions.push(option('treat', '包帯で足を手当てする', '3分'));
  if (s.location === 'fork' || s.location === 'return') {
    actions.push(option('bridge', s.location === 'fork' ? '吊り橋で祠へ向かう' : '吊り橋で村へ帰る', `${moveCost(s, 8)}分`));
    actions.push(option('river', s.location === 'fork' ? '川沿いに祠へ向かう' : '川沿いに村へ帰る', `${moveCost(s, 14)}分`));
  }
  if (s.location === 'entrance') {
    if (s.items.includes('meat')) actions.push(option('feed', '干し肉で親子獣を誘導する', '2分'));
    actions.push(option('wait', '獣から距離を取り静かに待つ', '6分'), option('scare', '剣で獣を追い払う（足が悪化）', '3分'));
  }
  if (s.location === 'shrine') {
    if (!s.covered && s.items.includes('coat')) actions.push(option('cover', '上着で灯具を覆う', '1分'));
    if (!s.items.includes('herb')) actions.push(option('pick', '月白草を採る', s.covered ? '1分' : '1分（結界作動時は追加6分・負傷）'));
    actions.push(option('leave', '祠を離れ帰路へ向かう', '1分'));
  }
  return actions;
}

function apply(previous: HeroState, action: string) {
  if (!available(previous).some(a => a.id === action)) throw Error('現在はその行動を実行できません。別の方法を相談してください。');
  const s = structuredClone(previous);
  let elapsed = 0;
  let result = '';
  switch (action) {
    case 'talk': result = '相談を続けた。時間も持ち物も変化していない。'; break;
    case 'abandon': s.ending = { success: false, title: '救援を待つ選択', reason: '旅を中断し、安全な場所で村の救援を待った。' }; result = s.ending.reason; break;
    case 'observe': {
      elapsed = 2; s.observed.push(s.location);
      const hints: Record<Place, string> = {
        fork: '吊り橋は片道8分、川沿いは14分。橋の端の板が傷んでいる。端を避けてゆっくりなら渡れそうだ。',
        entrance: '親獣は子獣を守っている。干し肉の匂いに反応する。離れて待つ余地もある。',
        shrine: '碑文には「採る者は、先に灯を伏せよ」。台座の魔力線は灯具につながっている。',
        return: '村まで橋は8分、川沿いは14分。悪化した足を未処置なら移動に4分余計にかかる。',
        village: '村の灯が見える。',
      };
      if (s.location === 'fork' || s.location === 'return') s.bridgeKnown = true;
      result = hints[s.location]; s.discoveries.push(result); break;
    }
    case 'treat': elapsed = 3; s.treated = true; s.items = s.items.filter(i => i !== 'bandage'); result = '包帯を使って足を固定した。走れないが、以後の移動は基本時間で歩ける。'; break;
    case 'bridge':
    case 'river': {
      elapsed = moveCost(s, action === 'bridge' ? 8 : 14);
      const hurt = action === 'bridge' && !s.bridgeKnown;
      if (hurt) { s.injury = 'worse'; s.treated = false; s.bridgeKnown = true; }
      s.location = s.location === 'fork' ? 'entrance' : 'village';
      result = `${action === 'bridge' ? '吊り橋を渡り' : '川沿いを歩き'}、${places[s.location]}に着いた。${hurt ? '傷んだ板で足をひねった。未処置の移動は4分余計にかかる。' : ''}`;
      if (s.location === 'entrance') result += '親獣が子獣を守るように入口をふさいでいる。';
      break;
    }
    case 'feed': elapsed = 2; s.items = s.items.filter(i => i !== 'meat'); s.location = 'shrine'; result = '干し肉を離れた場所に置いた。親子獣が移動し、リオは祠へ入った。台座に白い草、傍らに灯と碑文がある。'; break;
    case 'wait': elapsed = 6; s.location = 'shrine'; result = '距離を取り静かに待った。親子獣が去り、祠へ入った。台座に白い草、傍らに灯と碑文がある。'; break;
    case 'scare': elapsed = 3; s.location = 'shrine'; s.injury = 'worse'; s.treated = false; result = '剣で距離を作り、獣を追い払った。踏ん張った足が悪化した。祠の台座に白い草、傍らに灯と碑文がある。'; break;
    case 'cover': elapsed = 1; s.covered = true; s.items = s.items.filter(i => i !== 'coat'); result = '着ていた上着を灯具にかけて遮光した。台座の光が静まった。上着は灯具に残している。'; break;
    case 'pick':
      if (s.covered) { elapsed = 1; s.items.push('herb'); result = '結界が静まった台座から月白草を採った。月白草を手に入れた。'; }
      else { elapsed = 7; s.injury = 'worse'; s.treated = false; result = '草に手を伸ばすと結界が作動。6分を余計に失い、足が悪化した。月白草はまだ台座にある。灯具と台座が光でつながっている。'; if (!s.discoveries.includes('灯具と台座は魔力線でつながっている。')) s.discoveries.push('灯具と台座は魔力線でつながっている。'); }
      break;
    case 'leave': elapsed = 1; s.location = 'return'; result = `祠を離れ、村への分かれ道に出た。${s.items.includes('herb') ? '月白草を携えている。' : '月白草は入手していない。'}足の状態に合わせ帰り道を決めよう。`; break;
  }
  const rawMinutes = previous.minutes - elapsed;
  s.minutes = Math.max(0, rawMinutes);
  if (!s.ending && s.location === 'village' && rawMinutes >= 0) {
    const success = s.items.includes('herb');
    s.ending = { success, title: success ? '日没までに、おかえり。' : '帰還、けれど草は届かず', reason: success ? `月白草を届け、リオは日没までに村へ帰還した。残り${s.minutes}分。` : 'リオは帰還したが、月白草の入手は達成できなかった。' };
  } else if (!s.ending && rawMinutes <= 0) {
    s.ending = { success: false, title: '帰り道に落ちた夕闇', reason: '村に到着する前に日が沈んだ。リオは安全な場所で救援を待つ。' };
    // An over-budget action is interrupted: never report arrival or acquisition after sunset.
    const stopped = structuredClone(previous);
    stopped.minutes = 0; stopped.ending = s.ending;
    return { state: stopped, elapsed: previous.minutes, result: '行動の途中で日が沈み、作業を中断した。移動や取得は完了していない。安全な場所で救援を待つ。' };
  }
  return { state: s, elapsed, result };
}

export const heroWhisper: ContentDefinition<HeroState> = {
  info: {
    id: 'hero-whisper', version: '1.0.0', scenarioVersion: '1.0.0', rulesVersion: '1.0.0',
    title: '勇者の耳元', scenario: '日没までの帰り道',
    summary: 'あなたのひと言が、帰り道を変えていく。けがをした若い勇者と、日没までの小さな冒険。',
    objective: '月白草を手に入れ、日没までにリオを村へ帰還させる。',
    playerName: 'あなた（ナビ妖精）', characterName: 'リオ', playerRole: '物には触れられないナビ妖精。質問と助言で、リオの判断に働きかけます。近くの魔力を感じ取れます。',
    delegateLabel: 'リオに任せる', duration: '5〜10分',
    visuals: {
      thumbnail: { src: '/placeholders/hero-mission.svg', alt: 'リオと小さな妖精が夕方の帰り道を進む仮イラスト' },
      background: { src: '/placeholders/forest.svg', alt: '' },
      character: { src: '/placeholders/rio.svg', alt: '大きなマフラーを巻いたリオの仮キャラクター', position: '50% 100%' },
      player: { src: '/placeholders/fairy.svg', alt: 'ナビ妖精の仮アイコン' },
    },
    playNotes: ['最初の持ち物：剣・包帯・干し肉1個・上着。走ることはできません。', '短い会話は0分。観察・移動・作業で時間が進みます。', '行動は観察・移動・手当て・獣への対処・灯具の遮光・採取・帰還などに対応。未知の能力や物品の生成はできません。'],
    opening: [
      { role: 'narrator', text: '日没まで、あと45分。村に必要な月白草は川向こうの祠にある。森の分かれ道で、若い勇者が足をかばって立ち止まった。' },
      { role: 'character', text: '僕はリオ。足は少し痛むけど、歩けるよ。吊り橋なら片道8分、川沿いなら14分らしい。橋は古そうだ。どう進もうか？' },
    ],
  },
  create: () => ({ location: 'fork', minutes: 45, injury: 'light', treated: false, items: ['sword', 'bandage', 'meat', 'coat'], observed: [], bridgeKnown: false, covered: false, discoveries: [], ending: null }),
  available, apply,
  view: s => ({
    location: places[s.location],
    stats: [{ label: '日没まで', value: `${s.minutes}分`, ...(s.minutes <= 10 ? { tone: 'warning' as const } : {}) }, { label: '足の状態', value: s.treated ? '処置済み・走れない' : s.injury === 'light' ? '軽傷・走れない' : '悪化・移動＋4分', ...(s.injury === 'worse' && !s.treated ? { tone: 'warning' as const } : {}) }],
    inventory: s.items.map(i => itemNames[i]), discoveries: s.discoveries,
    privateInfo: s.location === 'shrine' ? ['妖精の感覚：台座の近くに魔力がある。物理的な危険までは分からない。'] : ['妖精の感覚：この近くに強い魔力の反応はない。物には触れられず、足の痛みはリオに聞く必要がある。'],
    ending: s.ending,
  }),
  context: s => JSON.stringify({ state: s, public: heroWhisper.view(s), persona: 'リオは人助けを大切にし、自分のけがを軽く考えがち。質問には観察と知識に基づき答える。剣・包帯・干し肉・上着以外は創作しない。初回は走れない。祠では碑文があることを自発的に知らせ、解法は観察や相談に応じ段階的に考える。助言に盲従も気まぐれな反抗もしない。拒否は短い理由と代案。' }),
  mock(s, message) {
    const allowed = available(s);
    const valid = (id: string) => allowed.some(a => a.id === id);
    const respond = (action: string, speech: string) => ({ action: valid(action) ? action : 'talk', speech: valid(action) ? speech : '今の場所や持ち物では難しそうだ。別の方法を一緒に考えたい。' });
    if (/任せ|進め/.test(message)) {
      const a = s.location === 'fork' ? 'bridge' : s.location === 'entrance' ? 'wait' : s.location === 'shrine' ? !s.observed.includes('shrine') ? 'observe' : !s.covered ? 'cover' : !s.items.includes('herb') ? 'pick' : 'leave' : s.injury === 'worse' && !s.treated && valid('treat') ? 'treat' : 'bridge';
      return respond(a, { bridge: '時間を残したい。橋を選ぼう。', wait: '子獣を守っているだけだね。傷つけずに待ちたい。', observe: '碑文を先に確かめてから考えたい。', cover: '上着で灯を隠す方法を試したい。', pick: '光が静まったね。採ってみたい。', leave: '村へ戻ろう。', treat: '帰る前に足を固定したい。' }[a] ?? '少し考えてみたい。');
    }
    if (/[?？]|教えて|どんな|どういう|何が|何を|持ち物|状態|残り|なぜ/.test(message)) return respond('talk', `今は${places[s.location]}。足は${s.treated ? '処置して歩ける' : s.injury === 'light' ? '痛むけれど歩ける。走るのは無理そう' : '悪化していて歩くのに時間がかかる'}。${s.location === 'shrine' ? '白い草の傍らに碑文と灯がある。調べる価値がありそう。' : '気になることは詳しく調べてから進みたい。'}`);
    const match: [RegExp, string, string][] = [
      [/救援|断念|諦め|中断/, 'abandon', '無理をせず、村の救援を待ちたい。'],
      [/調べ|観察|見回|確認|碑文|魔力を/, 'observe', 'まず周囲を確かめたい。'],
      [/包帯|手当|治療|固定/, 'treat', '少し時間を使って足を固定したい。'],
      [/川沿|迂回/, 'river', '足をかばいながら川沿いを歩こう。'],
      [/橋/, 'bridge', '橋を渡ってみよう。走らず歩くよ。'],
      [/干し肉|餌|えさ|誘導|肉を/, 'feed', '干し肉で離れた場所に誘ってみたい。'],
      [/追い払|剣で|威嚇/, 'scare', '危険はあるけれど、剣で距離を作ってみる。'],
      [/待つ|待とう|待って/, 'wait', '少し離れて、静かに待ちたい。'],
      [/上着|覆|かぶせ|遮光/, 'cover', '上着で灯を隠す方法を試したい。'],
      [/採|摘|入手/, 'pick', '台座の草に手を伸ばしてみたい。'],
      [/帰|戻|祠を出/, 'leave', '祠を離れて帰路に向かおう。'],
    ];
    const found = match.find(([re]) => re.test(message));
    if (found) return respond(found[1], found[2]);
    return respond('talk', 'その方法は今の道具では難しそうだ。物を増やしたり妖精に運んでもらうことはできない。今できる観察や移動、道具の使い方で別案を考えたい。（モックは決まった表現のみ対応）');
  },
};
