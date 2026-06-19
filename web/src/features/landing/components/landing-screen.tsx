import { LogoMark } from '@/components/layout/logo-mark';
import { TopBar } from '@/components/layout/top-bar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Link } from '@tanstack/react-router';
import { Image as ImageIcon, User } from 'lucide-react';

/**
 * 방문자용 메인 랜딩 — 가입 유도 마케팅 화면.
 * 히어로 A(분할형) + 공통 본문(인기작 랭킹·장르·주목 작가·에디터 PICK·CTA).
 * 표지/작가 사진은 실 이미지 연동 전까지 고스트 플레이스홀더로 비워 둔다.
 */

/** 장르 배지 색 (장식용 일회성 톤) */
const GENRE_BADGE: Record<string, string> = {
  무협: 'text-[#976d57] bg-[#f3eeee]',
  '로맨스 판타지': 'text-[#b35588] bg-[#faf1f5]',
  '현대 판타지': 'text-[#487ca5] bg-[#e7f3f8]',
  판타지: 'text-ai bg-ai-soft',
  '동양 판타지': 'text-ai bg-ai-soft',
};

/** 표지 고스트 슬롯 — 실 이미지 연동 전 비어 있는 자리표시 */
function Cover({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'grid place-items-center overflow-hidden border border-line bg-surface text-faintest',
        className
      )}
    >
      <ImageIcon className="size-1/4 max-h-9 max-w-9" strokeWidth={1.5} />
    </div>
  );
}

/** 작가 사진 고스트 슬롯 */
function Avatar({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'grid place-items-center overflow-hidden rounded-full border border-line bg-surface text-faintest',
        className
      )}
    >
      <User className="size-1/2" strokeWidth={1.5} />
    </div>
  );
}

function GenreBadge({ genre, className }: { genre: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-block rounded px-1.5 py-1 text-[11px] font-semibold leading-none',
        GENRE_BADGE[genre] ?? 'text-muted-ink bg-surface',
        className
      )}
    >
      {genre}
    </span>
  );
}

const NAV_ITEMS = ['홈', '랭킹', '장르', '신작', '작가'];

/** 랜딩 전용 마케팅 내비 — 상단 바 가운데 슬롯에 들어간다 */
function LandingNav() {
  return (
    <nav className="hidden items-center gap-[22px] text-sm font-medium text-ink-soft md:flex">
      {NAV_ITEMS.map((item, i) => (
        <span key={item} className={cn('cursor-pointer', i === 0 && 'font-semibold text-ink')}>
          {item}
        </span>
      ))}
    </nav>
  );
}

const HERO_STATS = [
  { value: '9.8', label: '독자 별점' },
  { value: '1.2억', label: '누적 조회' },
  { value: '48만', label: '관심 등록' },
];

function Hero() {
  return (
    <div className="overflow-hidden rounded-[10px] border border-ink/[0.09] bg-paper shadow-xs">
      <div className="flex flex-col items-center gap-8 bg-gradient-to-b from-surface-soft to-paper p-8 md:flex-row md:gap-11 md:p-[46px_50px_50px]">
        <Cover className="h-[430px] w-[300px] flex-none rounded-xl shadow-[0_16px_40px_rgba(15,15,15,0.18)]" />
        <div className="min-w-0 flex-1">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="rounded bg-danger px-[9px] py-[5px] text-xs font-semibold leading-none text-white">
              오늘의 대표작
            </span>
            <GenreBadge genre="동양 판타지" className="py-[5px]" />
            <span className="text-xs font-medium leading-none text-muted-ink">312화 연재 중</span>
          </div>
          <h2 className="mb-3.5 font-serif text-[46px] font-black leading-[1.15] tracking-[-0.02em] text-ink">
            붉은 달의
            <br />
            계승자
          </h2>
          <p className="mb-[22px] max-w-[560px] text-base leading-[1.7] text-ink-soft">
            멸문한 가문의 마지막 핏줄이 핏빛 달이 뜨는 밤마다 죽은 자의 기억을 물려받는다. 천 년의
            원한과 잊힌 술법이 한 소년의 검 끝에서 되살아난다.
          </p>
          <div className="mb-[26px] flex items-center gap-[26px]">
            {HERO_STATS.map((stat, i) => (
              <div key={stat.label} className="flex items-center gap-[26px]">
                {i > 0 && <div className="h-[30px] w-px bg-line" />}
                <div>
                  <div className="font-serif text-[22px] font-extrabold leading-none text-ink">
                    {stat.value}
                  </div>
                  <div className="mt-[5px] text-xs leading-none text-faint">{stat.label}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button render={<Link to="/auth/signup" />} className="h-10 px-4">
              1화 무료로 읽기
            </Button>
            <Button variant="secondary" className="h-10 px-4">
              관심 작품 담기
            </Button>
            <div className="ml-2 flex items-center gap-[9px]">
              <Avatar className="size-[34px] flex-none" />
              <div>
                <div className="text-[13px] font-semibold leading-none text-ink">윤하경</div>
                <div className="mt-[3px] text-[11.5px] leading-none text-faint">작가</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface RankItem {
  rank: number;
  genre: string;
  title: string;
  author: string;
  rating: string;
}

const RANKING: RankItem[] = [
  { rank: 1, genre: '무협', title: '만 번을 산 회귀 검신', author: '한설야', rating: '9.9' },
  {
    rank: 2,
    genre: '로맨스 판타지',
    title: '황녀님은 죽음을 거부한다',
    author: '도하린',
    rating: '9.7',
  },
  {
    rank: 3,
    genre: '현대 판타지',
    title: '던전 청소부의 은밀한 성장',
    author: '강태오',
    rating: '9.6',
  },
  { rank: 4, genre: '판타지', title: '탑의 마지막 관리자', author: '서리', rating: '9.5' },
  { rank: 5, genre: '로맨스 판타지', title: '악역의 구원자', author: '백서아', rating: '9.5' },
  { rank: 6, genre: '판타지', title: '대마법사의 은퇴는 실패했다', author: '노을', rating: '9.4' },
];

function RankBadge({ rank }: { rank: number }) {
  const top3 = rank <= 3;
  return (
    <span
      className={cn(
        'absolute left-2 top-2 grid place-items-center rounded-[7px] font-serif font-black text-white',
        top3 ? 'size-[30px] text-[18px]' : 'size-7 text-[16px]',
        rank === 1 ? 'bg-danger' : top3 ? 'bg-ink' : 'bg-ink/70'
      )}
      style={{ boxShadow: top3 ? '0 2px 6px rgba(0,0,0,0.2)' : undefined }}
    >
      {rank}
    </span>
  );
}

function RankingSection() {
  return (
    <section className="p-8 md:p-[44px_50px_40px]">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <div className="mb-[9px] text-xs font-semibold uppercase leading-none tracking-[0.06em] text-faint">
            Weekly Ranking
          </div>
          <h3 className="text-[25px] font-bold leading-tight tracking-[-0.01em] text-ink">
            이번 주 인기작 🔥
          </h3>
        </div>
        <span className="cursor-pointer text-sm font-semibold leading-none text-primary">
          주간 베스트 100 →
        </span>
      </div>
      <div className="grid grid-cols-2 gap-[18px] sm:grid-cols-3 lg:grid-cols-6">
        {RANKING.map((item) => (
          <div key={item.rank} className="flex flex-col">
            <div className="relative mb-3">
              <Cover className="aspect-[5/7] w-full rounded-[9px]" />
              <RankBadge rank={item.rank} />
            </div>
            <GenreBadge genre={item.genre} className="mb-2 self-start" />
            <div className="mb-[5px] font-serif text-[15px] font-bold leading-[1.35] text-ink">
              {item.title}
            </div>
            <div className="mb-[7px] text-[12.5px] leading-none text-faint">{item.author}</div>
            <div className="flex items-center gap-1 text-xs font-semibold leading-none text-genre">
              ★ <span className="text-ink-soft">{item.rating}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const GENRES = [
  {
    icon: '🐉',
    name: '판타지',
    desc: '차원과 마법, 회귀와 성장. 대표작 《탑의 마지막 관리자》',
    bg: 'bg-[#f6f3f9]',
  },
  {
    icon: '💗',
    name: '로맨스 판타지',
    desc: '황녀와 공작, 빙의와 책빙의. 대표작 《황녀님은 죽음을 거부한다》',
    bg: 'bg-[#faf1f5]',
  },
  {
    icon: '⚔️',
    name: '무협',
    desc: '강호와 문파, 회귀 검신의 시대. 대표작 《만 번을 산 회귀 검신》',
    bg: 'bg-[#f3eeee]',
  },
  {
    icon: '🏙️',
    name: '현대 판타지',
    desc: '각성과 헌터, 재벌과 연예계. 대표작 《던전 청소부의 은밀한 성장》',
    bg: 'bg-[#e7f3f8]',
  },
  {
    icon: '🔍',
    name: '미스터리 · 스릴러',
    desc: '추리와 반전, 서스펜스. 대표작 《마지막 목격자》',
    bg: 'bg-[#f1f1ef]',
  },
  {
    icon: '📜',
    name: '대체역사 · 전쟁',
    desc: '역사의 분기점에 선 자들. 대표작 《장군의 두 번째 생》',
    bg: 'bg-[#fbf3db]',
  },
];

function GenreSection() {
  return (
    <section className="p-8 md:p-[42px_50px_40px]">
      <div className="mb-[22px]">
        <div className="mb-[9px] text-xs font-semibold uppercase leading-none tracking-[0.06em] text-faint">
          Browse by Genre
        </div>
        <h3 className="text-[25px] font-bold leading-tight tracking-[-0.01em] text-ink">
          장르별 둘러보기
        </h3>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {GENRES.map((genre) => (
          <div
            key={genre.name}
            className={cn(
              'cursor-pointer rounded-[10px] border border-ink/[0.09] p-5 transition-shadow hover:shadow-md',
              genre.bg
            )}
          >
            <div className="mb-3 text-[26px]">{genre.icon}</div>
            <div className="mb-1.5 text-[17px] font-bold leading-tight text-ink">{genre.name}</div>
            <div className="text-[13px] leading-[1.5] text-muted-ink">{genre.desc}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

const AUTHORS = [
  {
    name: '한설야',
    genre: '무협',
    bio: '회귀 검신 신화를 쓴 정통 무협의 대가. 묵직한 합과 강호의 의리.',
    works: 12,
    views: '5.2억',
  },
  {
    name: '도하린',
    genre: '로맨스 판타지',
    bio: '황녀물의 새 기준을 세운 로판 신성. 섬세한 감정선과 통쾌한 복수.',
    works: 7,
    views: '3.8억',
  },
  {
    name: '강태오',
    genre: '현대 판타지',
    bio: '현판 흥행 보증수표. 헌터물의 장인, 시원한 사이다 전개의 정석.',
    works: 9,
    views: '4.5억',
  },
];

function AuthorSection() {
  return (
    <section className="p-8 md:p-[42px_50px_40px]">
      <div className="mb-[22px] flex items-end justify-between">
        <div>
          <div className="mb-[9px] text-xs font-semibold uppercase leading-none tracking-[0.06em] text-faint">
            Authors to Watch
          </div>
          <h3 className="text-[25px] font-bold leading-tight tracking-[-0.01em] text-ink">
            주목할 작가 ✍️
          </h3>
        </div>
        <span className="cursor-pointer text-sm font-semibold leading-none text-primary">
          작가 전체 보기 →
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {AUTHORS.map((author) => (
          <div key={author.name} className="rounded-[10px] border border-ink/[0.09] p-[22px]">
            <div className="mb-[15px] flex items-center gap-[13px]">
              <Avatar className="size-14 flex-none" />
              <div>
                <div className="text-[17px] font-bold leading-tight text-ink">{author.name}</div>
                <GenreBadge genre={author.genre} className="mt-[7px]" />
              </div>
            </div>
            <p className="mb-4 min-h-11 text-[13.5px] leading-[1.6] text-ink-soft">{author.bio}</p>
            <div className="flex items-center justify-between">
              <div className="text-[12.5px] leading-none text-faint">
                작품 {author.works} · 누적 <b className="font-bold text-ink">{author.views}</b> 뷰
              </div>
              <Button variant="secondary" size="sm" className="h-8">
                팔로우
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const PICKS = [
  { title: '붉은 달의 계승자', author: '윤하경' },
  { title: '만 번을 산 회귀 검신', author: '한설야' },
  { title: '다시 쓰는 가문', author: '서리' },
  { title: '회귀자의 마지막 선택', author: '노을' },
];

const UPDATES = [
  { title: '붉은 달의 계승자', meta: '313화 공개 · 동양 판타지', time: '방금', hot: true },
  { title: '만 번을 산 회귀 검신', meta: '488화 공개 · 무협', time: '12분 전', hot: false },
  {
    title: '황녀님은 죽음을 거부한다',
    meta: '201화 공개 · 로맨스 판타지',
    time: '1시간 전',
    hot: false,
  },
  { title: '탑의 마지막 관리자', meta: '156화 공개 · 판타지', time: '3시간 전', hot: false },
  {
    title: '던전 청소부의 은밀한 성장',
    meta: '274화 공개 · 현대 판타지',
    time: '5시간 전',
    hot: false,
  },
];

function EditorPickSection() {
  return (
    <section className="flex flex-col gap-9 p-8 md:p-[42px_50px_40px] lg:flex-row">
      <div className="min-w-0 flex-[1.55]">
        <div className="rounded-xl border border-ink/[0.09] bg-[#edf3ec] p-[26px_28px]">
          <div className="mb-1.5 flex items-center gap-[9px]">
            <span className="rounded bg-success px-2 py-[5px] text-[11px] font-bold leading-none text-white">
              EDITOR'S PICK
            </span>
            <span className="text-[12.5px] font-medium leading-none text-success">
              매주 수요일 업데이트
            </span>
          </div>
          <h3 className="mb-1.5 font-serif text-[22px] font-extrabold leading-[1.3] text-ink">
            비 오는 날 읽기 좋은 회귀물 4선
          </h3>
          <p className="mb-[22px] max-w-[560px] text-[13.5px] leading-[1.6] text-ink-soft">
            한 번 더 사는 삶, 되돌리고 싶은 선택. 에디터가 직접 고른 깊고 묵직한 회귀 서사 모음.
          </p>
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
            {PICKS.map((pick) => (
              <div key={pick.title}>
                <Cover className="mb-[9px] aspect-[5/7] w-full rounded-lg" />
                <div className="font-serif text-[13px] font-bold leading-[1.35] text-ink">
                  {pick.title}
                </div>
                <div className="mt-1 text-[11.5px] leading-none text-faint">{pick.author}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-[18px] flex items-center gap-2">
          <span className="size-2 rounded-full bg-danger" />
          <h3 className="text-[18px] font-bold leading-tight text-ink">실시간 연재 업데이트</h3>
        </div>
        <div className="flex flex-col">
          {UPDATES.map((update, i) => (
            <div
              key={update.title}
              className={cn(
                'flex items-center gap-[13px] py-[11px]',
                i < UPDATES.length - 1 && 'border-b border-ink/[0.07]'
              )}
            >
              <Cover className="h-[58px] w-[42px] flex-none rounded-[5px]" />
              <div className="min-w-0 flex-1">
                <div className="mb-1 font-serif text-sm font-semibold leading-[1.3] text-ink">
                  {update.title}
                </div>
                <div className="text-xs leading-none text-faint">{update.meta}</div>
              </div>
              <span
                className={cn(
                  'flex-none text-[11.5px] leading-none',
                  update.hot ? 'font-semibold text-danger' : 'font-medium text-faint'
                )}
              >
                {update.time}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CtaBanner() {
  return (
    <section className="p-8 md:p-[8px_50px_50px]">
      <div className="relative flex flex-col items-start justify-between gap-10 overflow-hidden rounded-[14px] bg-ink p-10 md:flex-row md:items-center md:p-[48px_52px]">
        <div
          className="absolute -right-10 -top-10 size-60 rounded-full"
          style={{ background: 'rgba(35,131,226,0.18)', filter: 'blur(12px)' }}
        />
        <div className="relative">
          <h3 className="mb-3 font-serif text-[32px] font-black leading-[1.25] tracking-[-0.01em] text-white">
            당신의 이야기가
            <br />
            다음 대표작이 됩니다
          </h3>
          <p className="max-w-[480px] text-[15.5px] leading-[1.7] text-white/70">
            AI 창작 코파일럿과 함께 첫 화를 시작하거나, 320만 독자의 책장 속으로 들어가 보세요.
            가입은 1분이면 충분합니다.
          </p>
        </div>
        <div className="relative flex flex-none flex-col gap-3">
          <Button render={<Link to="/auth/signup" />} className="h-12 w-60">
            작가로 연재 시작하기
          </Button>
          <Button
            render={<Link to="/auth/signup" />}
            className="h-12 w-60 border border-white/30 bg-white/[0.12] text-white hover:bg-white/20"
          >
            무료로 읽기 시작
          </Button>
          <span className="text-center text-xs leading-[1.5] text-white/50">
            신용카드 없이 가입 · 매일 무료 코인
          </span>
        </div>
      </div>
    </section>
  );
}

const FOOTER_LINKS = ['이용약관', '개인정보처리방침', '작가 지원', '고객센터'];

function Footer() {
  return (
    <footer className="flex flex-col items-start justify-between gap-4 border-t border-ink/[0.08] p-[30px_50px] md:flex-row md:items-center">
      <div className="flex items-center gap-2">
        <LogoMark size={22} withWordmark />
        <span className="ml-1.5 text-[12.5px] leading-none text-faint">
          © 2026 StoryWeaver — AI 웹소설 창작 플랫폼
        </span>
      </div>
      <div className="flex items-center gap-[22px] text-[13px] font-medium leading-none text-muted-ink">
        {FOOTER_LINKS.map((link) => (
          <span key={link} className="cursor-pointer hover:text-ink">
            {link}
          </span>
        ))}
      </div>
    </footer>
  );
}

export function LandingScreen() {
  return (
    <div className="min-h-screen bg-board font-sans text-ink">
      <TopBar>
        <LandingNav />
      </TopBar>
      <main className="mx-auto max-w-[1280px] space-y-[30px] px-5 py-9 lg:px-0">
        <Hero />
        <div className="overflow-hidden rounded-[10px] border border-ink/[0.09] bg-paper shadow-xs">
          <RankingSection />
          <div className="mx-[50px] h-px bg-ink/[0.08]" />
          <GenreSection />
          <div className="mx-[50px] h-px bg-ink/[0.08]" />
          <AuthorSection />
          <div className="mx-[50px] h-px bg-ink/[0.08]" />
          <EditorPickSection />
          <CtaBanner />
          <Footer />
        </div>
      </main>
    </div>
  );
}
