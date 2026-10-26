import { canon } from "./core.js";

// Programming choices, not a promise of injury prevention or less soreness.
const groups = {
  chest: ["平板卧推", "上斜卧推", "俯卧撑", "哑铃胸部飞鸟"],
  shoulder: ["坐姿推肩", "站姿哑铃侧平举", "坐姿俯身反向飞鸟", "坐姿反向飞鸟"],
  triceps: ["过顶臂屈伸"],
  back: ["高位下拉", "上斜划船", "单臂哑铃划船", "双臂哑铃俯身划船"],
  squat: [
    "保加利亚分腿蹲",
    "自重保加利亚分腿蹲",
    "原地箭步蹲",
    "坐凳深蹲",
    "高脚杯深蹲",
  ],
  hinge: ["罗马尼亚硬拉", "壶铃摆动", "地面哑铃臀桥", "自重臀桥"],
  core: [
    "平板支撑",
    "平板支撑肩触碰",
    "屈膝侧桥",
    "站姿单侧哑铃静止保持",
    "站姿绳索抗旋转推",
    "站姿绳索斜向下拉",
    "死虫式",
    "仰卧小幅卷腹",
  ],
  biceps: ["靠腿二头弯举"],
};
const step = (name, dose, cue) => ({ name, dose, cue });
export function dailyPreparation(items) {
  const names = items.map((i) => canon(Array.isArray(i) ? i[0] : i.name));
  const has = (g) => names.some((n) => groups[g].includes(n));
  const upper =
    has("chest") ||
    has("shoulder") ||
    has("back") ||
    has("triceps") ||
    has("biceps");
  const lower = has("squat") || has("hinge");
  const dynamic = [],
    stretches = [];
  if (upper)
    dynamic.push(
      step(
        "肩臂绕环",
        "前后各 6–8 次",
        "站立，先小圈再稍扩大；肩不耸起，活动到舒适范围。",
      ),
    );
  if (has("chest") || has("triceps"))
    dynamic.push(
      step(
        "扶墙肩胛推",
        "6–8 次",
        "双手扶墙、肘伸直，胸廓缓慢靠近再推离墙；只做小幅肩胛活动，不塌腰。",
      ),
    );
  if (has("back") || has("biceps"))
    dynamic.push(
      step(
        "站姿屈肘后拉",
        "8 次",
        "双臂前伸，再让肘缓慢拉向身体两侧；不耸肩，不甩动，练习拉的路径。",
      ),
    );
  if (has("squat")) {
    dynamic.push(
      step(
        "扶稳踝前移",
        "每侧 6–8 次",
        "扶住固定支撑，一脚在前、脚跟不离地，膝盖沿脚尖方向缓慢前移再回位。",
      ),
    );
    dynamic.push(
      step(
        "扶稳原地分腿蹲",
        "每侧 5 次",
        "后脚落地、不负重；前脚踩稳，以舒适幅度缓慢屈伸，练习左右平衡。",
      ),
    );
  }
  if (has("hinge") || names.some((n) => /划船/.test(n)))
    dynamic.push(
      step(
        "徒手髋铰链",
        "6–8 次",
        "微屈膝、臀部向后移，背部保持自然；感受髋部折叠，不追求手触地。",
      ),
    );
  if (has("core"))
    dynamic.push(
      step(
        "站姿收紧与呼吸",
        "3–4 次缓慢呼吸",
        "自然站立、肋骨与骨盆对齐，呼气时轻收腹，吸气仍可保持躯干稳定；不屏息。",
      ),
    );

  const weightedMain = names.find((n) =>
    [
      "平板卧推",
      "上斜卧推",
      "坐姿推肩",
      "高位下拉",
      "上斜划船",
      "单臂哑铃划船",
      "双臂哑铃俯身划船",
      "保加利亚分腿蹲",
      "高脚杯深蹲",
      "罗马尼亚硬拉",
    ].includes(n),
  );
  const specific = [];
  if (weightedMain)
    specific.push(
      step(
        `${weightedMain} · 递增热身`,
        "轻 6–8 次 → 稍重 3–5 次",
        "以今天确认的工作重量为基准：约 40–60% 做 1 组，再约 70–80% 做 1 组；选接近且偏轻的可用档位，不按历史最高值。组间休息 45–90 秒，之后休息约 1–2 分钟再开始工作组；单侧次数均按每侧。很轻的工作重量可只做 1 组，始终不做到吃力。",
      ),
    );
  const later = names.find(
    (n) =>
      n !== weightedMain &&
      [
        "坐姿推肩",
        "高位下拉",
        "单臂哑铃划船",
        "上斜划船",
        "罗马尼亚硬拉",
        "保加利亚分腿蹲",
      ].includes(n),
  );
  if (later)
    specific.push(
      step(
        `${later} · 轮到时再试练`,
        "轻负重 1 组 × 5–6 次",
        "在这个动作正式开始前试练，单侧按每侧；使用明显轻于今天工作重量的可控档位，不提前把整场热身做累。",
      ),
    );
  if (names.includes("平板支撑"))
    specific.unshift(
      step(
        "平板支撑 · 姿势试练",
        "5–10 秒 × 1 次",
        "只垫住前臂，肘在肩下、腹臀轻收、保持呼吸；这是姿势检查，结束后休息约 30 秒，不替代正式组。",
      ),
    );
  if (!specific.length)
    specific.push(
      step(
        "首个动作 · 轻松试练",
        "3–5 次；计时动作 5–10 秒",
        "用更轻负重或更容易的版本确认动作路径；不追求次数、时长或疲劳。",
      ),
    );

  if (has("chest"))
    stretches.push(
      step(
        "门框胸部拉伸",
        "每侧 20–30 秒 × 1 次",
        "前臂轻扶固定门框，肘略低于肩；身体小幅向前，感到胸前轻拉即可，不把肩向后硬扳。",
      ),
    );
  if (has("back"))
    stretches.push(
      step(
        "扶凳背阔肌拉伸",
        "20–30 秒 × 1 次",
        "双手扶稳固定训练凳或台面，臀部后移，胸口自然下沉；背部保持舒适，不悬挂、不压腰。",
      ),
    );
  if (has("shoulder"))
    stretches.push(
      step(
        "横臂后肩拉伸",
        "每侧 20–30 秒 × 1 次",
        "一臂横过胸前，另一手轻托上臂；肩保持下沉，不拉肘关节，不顶到疼痛。",
      ),
    );
  if (has("triceps"))
    stretches.push(
      step(
        "过顶三头拉伸",
        "每侧 20–30 秒 × 1 次",
        "一手伸到上背，另一手仅轻扶上臂；不按压肘部，腰不后仰，肩不舒服就跳过。",
      ),
    );
  if (has("squat"))
    stretches.push(
      step(
        "扶稳站姿股四头肌拉伸",
        "每侧 20–30 秒 × 1 次",
        "一手扶稳，另一手轻握同侧脚踝，膝盖自然靠拢；骨盆不前倾，不硬拉脚跟碰臀。够不到脚踝就跳过。",
      ),
    );
  if (has("hinge"))
    stretches.push(
      step(
        "站姿腘绳肌拉伸",
        "每侧 20–30 秒 × 1 次",
        "一脚向前、脚跟着地，支撑腿微屈；背部自然，从髋部小幅前倾，感到大腿后侧轻拉即可。",
      ),
    );
  if (lower)
    stretches.push(
      step(
        "扶墙小腿拉伸",
        "每侧 20–30 秒 × 1 次",
        "双手扶墙、一脚后退，后脚跟踩稳、脚尖向前；缓慢前移身体，保持呼吸。",
      ),
    );
  if (!stretches.length)
    stretches.push(
      step(
        "站姿侧伸展",
        "每侧 15–20 秒 × 1 次",
        "站稳，一臂上举、躯干小幅向另一侧伸展；不扭转、不后仰，只到轻拉感。",
      ),
    );
  return {
    warmup: [
      step(
        "先让身体暖起来",
        "快走 / 原地踏步 5 分钟",
        "逐渐加快到身体微暖、仍可完整说话；天气冷或仍僵硬时延长到 10 分钟。",
      ),
      ...dynamic,
      ...specific,
    ],
    cooldown: [
      step(
        "逐渐放慢",
        "慢走 5 分钟",
        "不要做完重组立刻坐下；逐渐放慢脚步，呼吸趋于平稳，必要时延长。",
      ),
      ...stretches.slice(0, 3),
    ],
  };
}

const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function preparationCard(items, phase = "warmup") {
  const warming = phase === "warmup",
    steps = dailyPreparation(items)[phase];
  return `<details class="glass card preparation-card" data-preparation="${phase}"><summary><span>${warming ? "训练前 · 热身" : "训练后 · 放松与拉伸"}</span><small>${warming ? "约 8–15 分钟" : "约 6–10 分钟"} · 展开跟练</small></summary><p class="prep-intro">${warming ? "升温 → 动态活动 → 主项试练。热身组不用打卡，不计入工作组。" : "先慢走，再按今天练到的部位轻拉。任选舒适动作，时间紧可少选；不强求每项。"}</p><ol class="prep-steps">${steps.map((s) => `<li><div><strong>${escape(s.name)}</strong><span>${escape(s.dose)}</span></div><details><summary>怎么做</summary><p>${escape(s.cue)}</p></details></li>`).join("")}</ol><p class="prep-note">${warming ? "保持轻松、不提前力竭；长时间静态拉伸留到训练后。" : "只到轻微牵拉、不弹震；疼痛、麻木或关节不适立即停止。拉伸主要帮助柔韧性，不保证消除酸痛或预防损伤。"}</p><details class="prep-evidence"><summary>依据与说明</summary><p>具体动作和剂量为结合当天计划、器械及小垫条件的实用安排，并非唯一最佳处方。</p><a href="https://www.heart.org/en/healthy-living/exercise-and-physical-activity/fitness-basics/warm-up-cool-down" target="_blank" rel="noopener">AHA · 热身、放松与拉伸 ↗</a><a href="https://www.sportsmed.org/flexibility-and-stretching" target="_blank" rel="noopener">AOSSM · 动态与静态拉伸 ↗</a><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC7558980/" target="_blank" rel="noopener">主项专项热身研究 ↗</a></details></details>`;
}
