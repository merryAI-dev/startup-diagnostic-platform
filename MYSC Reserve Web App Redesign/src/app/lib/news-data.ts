// Mock 뉴스 데이터
// 실제 환경에서는 News API (https://newsapi.org) 또는 Google News API를 사용할 수 있습니다.

export interface NewsArticle {
  id: string;
  title: string;
  description: string;
  source: string;
  publishedAt: string;
  url: string;
  imageUrl?: string;
  category: "industry" | "tech" | "social-impact" | "investment" | "policy" | "market";
  relevanceScore: number; // 0-100
}

// 기업별 맞춤 뉴스 생성 (Mock)
export function generateCompanyRelevantNews(companyName: string, industry?: string): NewsArticle[] {
  const baseNews: NewsArticle[] = [
    {
      id: "news1",
      title: "소셜벤처 투자 규모 전년 대비 40% 증가, 2026년 1조원 돌파 전망",
      description: "국내 소셜벤처에 대한 투자가 급증하면서 임팩트 투자 시장이 빠르게 성장하고 있다. 전문가들은 ESG 경영 강화와 정부 지원 확대가 주요 요인이라고 분석한다.",
      source: "임팩트비즈니스",
      publishedAt: "2026-02-06",
      url: "#",
      imageUrl: "https://images.unsplash.com/photo-1758519289559-f4d0ead39634?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxidXNpbmVzcyUyMGludmVzdG1lbnQlMjBtZWV0aW5nfGVufDF8fHx8MTc3MDUxNjUxNHww&ixlib=rb-4.1.0&q=80&w=1080",
      category: "investment",
      relevanceScore: 95,
    },
    {
      id: "news2",
      title: "중소벤처기업부, 소셜벤처 육성 예산 30% 확대",
      description: "정부가 소셜벤처 생태계 활성화를 위해 관련 예산을 대폭 늘리고, 맞춤형 컨설팅 프로그램을 확대한다고 발표했다.",
      source: "벤처타임즈",
      publishedAt: "2026-02-05",
      url: "#",
      imageUrl: "https://images.unsplash.com/photo-1591696205602-2f950c417cb9?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxidXNpbmVzcyUyMGdyb3d0aCUyMGNoYXJ0fGVufDF8fHx8MTc3MDUxNTgxNHww&ixlib=rb-4.1.0&q=80&w=1080",
      category: "policy",
      relevanceScore: 88,
    },
    {
      id: "news3",
      title: "임팩트 스타트업, AI 기술 접목으로 사회문제 해결 가속화",
      description: "국내 주요 임팩트 스타트업들이 AI와 빅데이터 기술을 활용해 사회문제 해결 효과를 극대화하고 있다. 특히 교육, 환경, 돌봄 분야에서 두각을 나타내고 있다.",
      source: "테크임팩트",
      publishedAt: "2026-02-04",
      url: "#",
      imageUrl: "https://images.unsplash.com/photo-1568952433726-3896e3881c65?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx0ZWNobm9sb2d5JTIwaW5ub3ZhdGlvbnxlbnwxfHx8fDE3NzA1MTY1MTR8MA&ixlib=rb-4.1.0&q=80&w=1080",
      category: "tech",
      relevanceScore: 92,
    },
    {
      id: "news4",
      title: "B Corp 인증 기업, 매출 성장률 일반 기업 대비 2배 높아",
      description: "B Corporation 인증을 받은 기업들의 평균 매출 성장률이 일반 기업보다 2배 이상 높은 것으로 조사됐다. 지속가능성이 경쟁력이 되는 시대가 본격화되고 있다.",
      source: "지속가능경영뉴스",
      publishedAt: "2026-02-03",
      url: "#",
      imageUrl: "https://images.unsplash.com/photo-1702468049239-49fd1cf99d20?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzdGFydHVwJTIwb2ZmaWNlJTIwdGVhbXdvcmt8ZW58MXx8fHwxNzcwNTE2NTE0fDA&ixlib=rb-4.1.0&q=80&w=1080",
      category: "market",
      relevanceScore: 85,
    },
    {
      id: "news5",
      title: "그린테크 스타트업 투자 열풍, 1분기에만 5000억원 유입",
      description: "기후위기 대응 솔루션을 제공하는 그린테크 스타트업에 대한 투자가 폭발적으로 증가하고 있다. 탄소중립 목표 달성을 위한 기술 혁신이 투자자들의 관심을 끌고 있다.",
      source: "그린비즈니스",
      publishedAt: "2026-02-02",
      url: "#",
      imageUrl: "https://images.unsplash.com/photo-1740176346553-f4c0c1be95d7?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxncmVlbiUyMHRlY2hub2xvZ3klMjBlbnZpcm9ubWVudHxlbnwxfHx8fDE3NzA1MTY1MTV8MA&ixlib=rb-4.1.0&q=80&w=1080",
      category: "industry",
      relevanceScore: 90,
    },
    {
      id: "news6",
      title: "사회적기업 디지털 전환 가속화, 클라우드 SaaS 도입 증가",
      description: "사회적기업들이 디지털 전환을 통해 운영 효율성을 높이고 있다. 특히 클라우드 기반 SaaS 솔루션 도입이 급증하면서 업무 생산성이 크게 향상되고 있다.",
      source: "소셜테크뉴스",
      publishedAt: "2026-02-01",
      url: "#",
      imageUrl: "https://images.unsplash.com/photo-1770013277247-ab7a08d3d9ba?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkaWdpdGFsJTIwdHJhbnNmb3JtYXRpb24lMjB0ZWNobm9sb2d5fGVufDF8fHx8MTc3MDQ2NDMyM3ww&ixlib=rb-4.1.0&q=80&w=1080",
      category: "tech",
      relevanceScore: 78,
    },
    {
      id: "news7",
      title: "임팩트 측정 표준화 논의 본격화, 국제 가이드라인 마련 추진",
      description: "사회적 가치 측정의 표준화를 위한 국제적 논의가 활발히 진행되고 있다. 투명성과 신뢰성 확보를 통해 임팩트 투자 시장이 더욱 성장할 것으로 기대된다.",
      source: "임팩트리포트",
      publishedAt: "2026-01-30",
      url: "#",
      imageUrl: "https://images.unsplash.com/photo-1765768737206-8f94009da6f0?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxidXNpbmVzcyUyMGNvbmZlcmVuY2UlMjBoYW5kc2hha2V8ZW58MXx8fHwxNzcwNTE2NTE1fDA&ixlib=rb-4.1.0&q=80&w=1080",
      category: "policy",
      relevanceScore: 72,
    },
    {
      id: "news8",
      title: "소셜벤처 채용 박람회 개최, 청년 취업 기회 확대",
      description: "사회적 가치를 추구하는 기업에서 일하고 싶어하는 청년들이 늘어나면서 소셜벤처 채용 시장이 활성화되고 있다. 다음 주 대규모 채용 박람회가 열린다.",
      source: "커리어임팩트",
      publishedAt: "2026-01-28",
      url: "#",
      imageUrl: "https://images.unsplash.com/photo-1762686485015-d0f1268fb99e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzb2NpYWwlMjBpbXBhY3QlMjBjb21tdW5pdHl8ZW58MXx8fHwxNzcwNTE2NTE1fDA&ixlib=rb-4.1.0&q=80&w=1080",
      category: "industry",
      relevanceScore: 65,
    },
  ];

  // 기업명이나 산업에 따라 관련도 점수 조정 (실제로는 키워드 매칭 등의 알고리즘 사용)
  return baseNews.map(news => ({
    ...news,
    relevanceScore: news.relevanceScore + (Math.random() * 10 - 5), // 약간의 변동
  })).sort((a, b) => b.relevanceScore - a.relevanceScore);
}

// 최신 트렌드 키워드
export const trendingKeywords = [
  "ESG 경영",
  "임팩트 투자",
  "B Corp",
  "탄소중립",
  "사회적 가치",
  "디지털 전환",
  "그린테크",
  "지속가능성",
];

// 카테고리별 색상
export const categoryColors: Record<NewsArticle["category"], string> = {
  "industry": "#0A2540",
  "tech": "#5DADE2",
  "social-impact": "#27AE60",
  "investment": "#F39C12",
  "policy": "#8E44AD",
  "market": "#E74C3C",
};

// 카테고리 한글명
export const categoryLabels: Record<NewsArticle["category"], string> = {
  "industry": "업계 동향",
  "tech": "기술",
  "social-impact": "소셜임팩트",
  "investment": "투자",
  "policy": "정책",
  "market": "시장",
};

/**
 * 실제 뉴스 크롤링을 위한 가이드:
 * 
 * 1. News API 사용 (https://newsapi.org)
 * ```typescript
 * const API_KEY = 'YOUR_NEWS_API_KEY';
 * const response = await fetch(
 *   `https://newsapi.org/v2/everything?q=${encodeURIComponent(keyword)}&language=ko&sortBy=publishedAt&apiKey=${API_KEY}`
 * );
 * const data = await response.json();
 * return data.articles;
 * ```
 * 
 * 2. Google News API 사용
 * ```typescript
 * const response = await fetch(
 *   `https://news.google.com/rss/search?q=${encodeURIComponent(keyword)}&hl=ko&gl=KR&ceid=KR:ko`
 * );
 * // RSS 파싱 필요
 * ```
 * 
 * 3. Naver News API 사용 (네이버 검색 API)
 * ```typescript
 * const CLIENT_ID = 'YOUR_CLIENT_ID';
 * const CLIENT_SECRET = 'YOUR_CLIENT_SECRET';
 * const response = await fetch(
 *   `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(keyword)}&display=10&sort=date`,
 *   {
 *     headers: {
 *       'X-Naver-Client-Id': CLIENT_ID,
 *       'X-Naver-Client-Secret': CLIENT_SECRET,
 *     }
 *   }
 * );
 * const data = await response.json();
 * return data.items;
 * ```
 * 
 * 4. Backend에서 크롤링하는 경우 (Puppeteer, Cheerio 등 사용)
 *    - CORS 문제 해결
 *    - 크롤링 주기 설정
 *    - 캐싱 전략 구현
 */