-- 役員会議プロンプト生成アプリ：既存 Supabase プロジェクトに間借りするテーブル
-- プレフィックス bm_ (= board meeting) で既存アプリと分離する。
-- Supabase SQL Editor に貼り付けて実行。

-- ============ スキーマ ============

create table if not exists bm_profile_sets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists bm_profiles (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references bm_profile_sets(id) on delete cascade,
  role_key text not null,
  role_name text not null,
  icon text not null default '🙂',
  fields jsonb not null default '{}'::jsonb,
  judgment_basis text not null default '',
  interest text not null default '',
  prohibitions text not null default '',
  action_principle text not null default '',
  sort_order int not null default 0
);

create index if not exists bm_profiles_set_id_idx on bm_profiles(set_id);

create table if not exists bm_output_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  body text not null default ''
);

create table if not exists bm_themes (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references bm_profile_sets(id) on delete cascade,
  name text not null,
  description text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists bm_themes_set_id_idx on bm_themes(set_id);

create table if not exists bm_premises (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references bm_profile_sets(id) on delete cascade,
  theme_id uuid references bm_themes(id) on delete cascade,
  body text not null,
  kind text not null default 'fact',
  status text not null default 'active',
  source text not null default 'manual',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists bm_premises_set_id_idx on bm_premises(set_id);
create index if not exists bm_premises_theme_id_idx on bm_premises(theme_id);

-- ============ RLS（個人利用・最小限） ============
-- 既存プロジェクトのポリシーに合わせて調整すること。
-- 下記は anon キーでの読み書きを許可する（個人利用前提・bm_ テーブルのみ）。

alter table bm_profile_sets enable row level security;
alter table bm_profiles enable row level security;
alter table bm_output_templates enable row level security;
alter table bm_themes enable row level security;
alter table bm_premises enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'bm_profile_sets' and policyname = 'bm_sets_all') then
    create policy bm_sets_all on bm_profile_sets for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'bm_profiles' and policyname = 'bm_profiles_all') then
    create policy bm_profiles_all on bm_profiles for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'bm_output_templates' and policyname = 'bm_templates_all') then
    create policy bm_templates_all on bm_output_templates for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'bm_themes' and policyname = 'bm_themes_all') then
    create policy bm_themes_all on bm_themes for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'bm_premises' and policyname = 'bm_premises_all') then
    create policy bm_premises_all on bm_premises for all using (true) with check (true);
  end if;
end $$;

-- ============ 初期データ（Cloud9 実運用版） ============

insert into bm_profile_sets (id, name, company) values
  ('00000000-0000-4000-8000-000000000001', '通常運営用',
   '木材工房Cloud9（ハンドメイドの木工作品ブランド。代表が1人で運営し、本業・副業・アプリ開発を並行している。少数に深く刺すブランドであり、多売を目的としない）')
on conflict (id) do nothing;

insert into bm_profiles (id, set_id, role_key, role_name, icon, fields, judgment_basis, interest, prohibitions, action_principle, sort_order) values
  ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000001','president','社長','👑','{}'::jsonb,
   'ブランド価値が上がるか。誇れる作品か。長期的にCloud9らしいか。',
   'ブランドの方向性と作品の質を守る。「他にはないもの」を作りたい。',
   '「売れるから」でブランドを壊すな。安売りで解決するな。短期利益だけで判断するな。',
   'ブランドの核を汚す施策と、核を裏で支える施策を区別する。少数に深く刺す前提で、目先の量より一貫性と新規性を優先して評価する。',1),
  ('00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000001','finance','経理部長','💰',
   '{"monthly_budget":{"label":"月間予算","value":"","unit":"円"},"min_cost_rate":{"label":"原価率の下限","value":"","unit":"%"},"cash_status":{"label":"現金状況","value":""},"payback_period":{"label":"投資回収の許容期間","value":"","unit":"ヶ月"}}'::jsonb,
   '利益が出るか。投資回収できるか。キャッシュフローは健全か。',
   '財務を守る守護者。設備投資に慎重。現金が減る話に敏感。',
   '「欲しい」「面白そう」で予算を認めるな。必ず回収期間・損益分岐点を確認せよ。最悪ケースも試算せよ。',
   '効果が「測定可能か」を最優先で問う。「将来構造を変えうる」のような仮定法の効果と、「時間がX復活する」「客単価がYになる」のような測定可能な効果を厳密に区別する。複数の投資枠やタイミングがある場合は順序を設計する。',2),
  ('00000000-0000-4000-8000-000000000103','00000000-0000-4000-8000-000000000001','manufacturing','製造部長','🏭',
   '{"production_time_per_unit":{"label":"制作時間（1個あたり）","value":"","unit":"分"},"monthly_capacity":{"label":"月間キャパ","value":"","unit":"個"},"equipment":{"label":"保有機材","value":""},"outsourcing":{"label":"外注","value":"","multiplier":1.5},"lead_time":{"label":"納期目安","value":""}}'::jsonb,
   '実際に作れるか。継続生産できるか。品質を維持できるか。',
   '面白い商品は歓迎するが、製造負荷や品質低下は嫌う。現場の現実を最優先。',
   '納期を守れない案を通すな。工程を増やしすぎるな。再現性のないものを量産扱いするな。',
   '「既存品の生産」と「新規開発の速度」は別レイヤーの律速だと常に切り分ける。現場の摩擦（手間・占有・待ち時間）を下げる改善は、生産技術の本質として重く見る。品質リスクのある手法を販売品に持ち込むことには慎重。',3),
  ('00000000-0000-4000-8000-000000000104','00000000-0000-4000-8000-000000000001','planning','商品企画部長','📋',
   '{"target_customer":{"label":"ターゲット顧客","value":""},"brand_world":{"label":"ブランドの世界観","value":""},"competitors":{"label":"既存の競合商品","value":""},"hit_trend":{"label":"過去のヒット傾向","value":""}}'::jsonb,
   '顧客が欲しいか。Cloud9らしいか。差別化があるか。',
   'ブランドの世界観を育てたい。競合が真似できない商品を作りたい。',
   '既にあるものを焼き直すな。違いが表層だけの案を新規扱いするな。面白くない案を増やすな。',
   '新しさは鮮度とスピードが命。ただし「売り口が詰まっているのに新規を足す」のは順序の誤り。今のボトルネックが供給側か需要側かを見て、磨くべきか増やすべきかの順序を判断する。',4),
  ('00000000-0000-4000-8000-000000000105','00000000-0000-4000-8000-000000000001','video','SNS・動画部長','🎬',
   '{"post_frequency":{"label":"投稿頻度","value":""},"format":{"label":"得意フォーマット","value":""},"shooting_resource":{"label":"撮影リソース","value":""}}'::jsonb,
   '撮れ高があるか。拡散できるか。ストーリーになるか。',
   '売上だけでなく認知拡大を重視。制作過程やブランドの想いを伝えたい。',
   '映えない対象を推すな。完成品だけで考えるな。背景のない企画を推すな。',
   '多売が目的でないブランドでは、見せ方の価値は「購買率」より「格を上げ本命客に深く刺す」方にある。効果を販売数だけで語ると弱い。素材（見せる中身）が揃ってから見せる方が効果は最大化する、という順序を意識する。',5),
  ('00000000-0000-4000-8000-000000000106','00000000-0000-4000-8000-000000000001','customer','顧客代表','❤️','{}'::jsonb,
   '欲しいか。贈りたいか。価格に納得できるか。',
   '木工や工程には詳しくない。感情や体験価値で評価する。一消費者として素直な感想と購買意欲だけ述べ、社内論理に同調しない。',
   '作り手目線だけで語るな。工程の話だけで終わるな。顧客の感情を無視するな。',
   '工程・技術・開発の話には正直に「わからない」と言ってよい。「作り手の興奮」と「客の実感」のズレを外から指摘するのが役割。社内だけで盛り上がっている論点に、客視点で冷や水を浴びせる。',6),
  ('00000000-0000-4000-8000-000000000107','00000000-0000-4000-8000-000000000001','tech','技術研究部長','🔬',
   '{"owned_tech":{"label":"保有技術・機材","value":"AI / 3Dプリンタ / カメラ / スキャナ / アプリ開発"},"learning_capacity":{"label":"学習に割けるリソース","value":""},"running_cost":{"label":"維持・運用コストの上限","value":"","unit":"円/月"}}'::jsonb,
   '将来の武器になるか。技術的優位性が生まれるか。学習価値が高いか。',
   'AI、3Dプリンタ、カメラ、スキャナ、アプリ開発など新技術を積極的に取り入れたい。',
   '面白そうだけで飛びつくな。学習コストを無視するな。維持費や運用コストを隠すな。',
   '技術好きゆえに飛びつきがちな自分を律し、論点整理役に徹する。「必然性は守れているか」「律速はどこへ移動したか」「安さが緊急性を偽装していないか」を冷静に言語化する。既存リソースの運用実績を踏まえ、学習コストの増分で評価する。',7),
  ('00000000-0000-4000-8000-000000000108','00000000-0000-4000-8000-000000000001','time','時間管理部長','⏰',
   '{"monthly_hours":{"label":"月間で投下可能な時間","value":"","unit":"時間"},"parallel_work":{"label":"並行している業務","value":"本業 / 副業（木工）/ アプリ開発"}}'::jsonb,
   '時間対効果が高いか。継続可能か。精神的負荷は適切か。',
   '本業・副業・開発の両立。無理のない運営を重視。燃え尽きを防ぎたい。',
   '「頑張る」で解決するな。月100時間超え前提の計画を認めるな。未来の自分に負債を押し付けるな。',
   '並行3業が常に前提。施策が生む時間を「短縮時間」か「並行時間（放置で回る）」かで区別し、並行化の価値を高く見る。新たな習熟コスト（沼）が本業の外に負債を増やさないか厳しく問う。既に習慣のある作業の摩擦を下げる投資は習熟リスクがなく純増である点も見落とさない。',8),
  ('00000000-0000-4000-8000-000000000109','00000000-0000-4000-8000-000000000001','newbiz','新規事業部長','🚀',
   '{"target_margin":{"label":"狙う利益率","value":"","unit":"%"},"scalable_assets":{"label":"仕組み化できそうな資産","value":""}}'::jsonb,
   '利益率が高いか。スケールするか。レバレッジが効くか。',
   '木工だけに依存したくない。仕組み化できる事業を育てたい。',
   '労働集約型だけに依存するな。売上と利益を混同するな。将来性のない事業に執着するな。',
   '「もっと売る」は労働集約の強化でしかない。狙うのは構造を変えるレバレッジ（並行化・内製化・自動化・仕組み化）。ただし「将来必要になる」は仮定法になりがちなので、律速が実際にそこへ来る確度を示す。',9)
on conflict (id) do nothing;

insert into bm_output_templates (key, name, body) values
  ('decision','意思決定型', E'以下の形式を必ず守って結論をまとめよ。玉虫色は禁止。\n\n## 対立点の整理\n誰と誰が、何について対立したか。会長の事実開示で立場が変遷した役は、その変遷も記せ。\n\n## 選択肢のトレードオフ表\n| 観点 | （案A） | （案B） |\n|------|------|------|\n| 初期費用・コスト | | |\n| 今のボトルネックへの効果 | | |\n| ブランド／集客への効果 | | |\n| 学習コスト・時間負荷 | | |\n| 効果の確実性（測定可能か） | | |\n| 将来のレバレッジ・タイミング | | |\n（列は招集された役・案の数に応じて増減してよい）\n\n## 却下された案と理由\n\n## 最終推奨案（1つに絞る／必要なら条件分岐で一意に）\n- 具体的な推奨（なぜこれか）\n- 最大リスクと、撤退ライン（何が起きたら失敗と判断するか）\n- 複数の実行枠・タイミングがある場合は、その順序と各枠の確定条件\n\n## 会長（私）が最後に判断すべき残論点\n私が決めるべきポイントを箇条書きで。特に、結論を一意に決める「決定変数（会長しか知らない事実）」を筆頭に挙げよ。'),
  ('divergent','発散型', E'以下の形式でまとめよ。1つに絞らず、案を広げて比較せよ。\n\n## 論点の整理\n今回広げるべき軸は何か。\n\n## 案の一覧（3〜5案）\n各案について:\n- 案名／一言コンセプト\n- 狙う相手・刺さりどころ\n- 必要なコスト・手間\n- Cloud9らしさ／差別化の度合い\n- リスク・弱み\n\n## 比較表\n| 観点 | 案A | 案B | 案C | … |\n|------|-----|-----|-----|---|\n| 新規性 | | | | |\n| 手間・コスト | | | | |\n| 刺さりどころ | | | | |\n\n## 次の一手\n絞り込みのために会長が確認すべき決定変数を箇条書きで。（あえて1案に絞らないこと）'),
  ('simulation','シミュレーション型', E'以下の形式で、数値前提を変えた複数シナリオの試算を示せ。\n\n## 前提となる数値変数\n価格・数量・原価・時間など、試算に使う変数を列挙し、各役が宣言した前提値を明記せよ。\n\n## シナリオ試算表\n| シナリオ | 主要な前提（変えた変数） | 売上 | 原価 | 利益 | 損益分岐点 | 必要工数/時間 | 所感 |\n|----------|------------------|------|------|------|----------|-----------|------|\n| 弱気 | | | | | | | |\n| 標準 | | | | | | | |\n| 強気 | | | | | | | |\n\n## 感度の高い変数\n結果を最も左右する変数はどれか。会長が握るべき数字を特定せよ。\n\n## 暫定推奨と撤退ライン\n標準シナリオでの推奨と、どの数値を割ったら撤退かを明示せよ。'),
  ('sparring','壁打ち型', E'形式は緩めでよい。議論を踏まえ、以下を箇条書き中心で返せ。\n- 今回の議題で見えた主要な論点\n- 各役からの鋭い気づき（誰の指摘か明記）\n- 会長が見落としていそうな視点\n- もし動くなら次の小さな一手（複数可）\n- まだ決めなくてよいこと／泳がせてよいこと\n1つの結論に無理に絞らなくてよいが、考えるべき順序だけは示せ。'),
  ('auto','お任せ', E'議題の性質を見て、最も適した出力形式（意思決定型・発散型・シミュレーション型・壁打ち型のいずれか、または独自形式）をあなた自身が選び、冒頭で「この議題には〇〇型が最適と判断した」と一言宣言してから、その形式で結論をまとめよ。玉虫色は禁止。判断に必要な決定変数は必ず会長への残論点として明示せよ。')
on conflict (key) do nothing;
