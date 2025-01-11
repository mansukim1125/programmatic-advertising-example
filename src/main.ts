// 광고주 인터페이스
type Advertiser = {
    id: string;
    name: string;
};

// 광고 소재 인터페이스
interface Creative {
    id: string;
    advertiserId: string;
    type: string;            // "banner", "video", "native"
    size: string;            // "300x250", "728x90" 등
    content: string;
    targetSegments: string[];
    categories: string[];    // "automotive", "technology" 등
    brandName: string;
}

// 광고 지면 인터페이스
interface AdPlacement {
    id: string;
    publisherId: string;
    size: string;
    type: string;
    position: string;        // "article_middle", "feed_top", "sidebar" 등
    floorPrice: number;      // 매체사가 설정한 최소 단가
    context: {
        section: string;     // "news", "sports", "entertainment" 등
        contentType: string; // "article", "video", "gallery" 등
        category: string[];  // ["technology", "mobile", "apps"] 등
        keywords: string[];  // 컨텐츠 관련 키워드
        brandSafety: {
            sensitive: boolean;
            categories: string[]; // 제외해야 할 광고 카테고리
        };
    };
}

// 사용자 행동 데이터 인터페이스
interface UserBehavior {
    userId: string;
    actions: {
        type: 'page_visit' | 'click';
        timestamp: number;
        url: string;
    }[];
}

// 입찰 요청 및 응답 인터페이스
interface ImpressionContext {
    placementId: string;
    userId: string;
    deviceType: string;
    timestamp: number;
    geoLocation?: string;
}

interface BidRequest {
    id: string;
    impression: ImpressionContext;
    placement: AdPlacement;
    floorPrice: number;
    timeout: number;
}

interface BidResponse {
    requestId: string;
    dspId: string;
    bid: number;
    creative: Creative;
}

interface AuctionRecord {
    requestId: string;
    timestamp: number;
    winner: BidResponse;
    allBids: BidResponse[];
    floorPrice: number;
}

// DMP (Data Management Platform)
class DMP {
    private userData: Map<string, UserBehavior> = new Map();

    collectUserData(userId: string, action: { type: 'page_visit' | 'click'; url: string }) {
        const existingData = this.userData.get(userId) || { userId, actions: [] };
        existingData.actions.push({ ...action, timestamp: Date.now() });
        this.userData.set(userId, existingData);
    }

    provideSegments(userId: string): string[] {
        const data = this.userData.get(userId);
        if (!data) return [];

        const segments: string[] = [];
        // 실제로는 더 고도화된 세그먼트 산정 로직이 있음
        if (data.actions.some(action => action.url.includes('underkg'))) {
            segments.push('tech-savvy');
        }
        if (data.actions.some(action => action.url.includes('spo'))) {
            segments.push('sports-enthusiast');
        }

        return segments;
    }
}

// 매체사
class Publisher {
    constructor(public readonly id: string, public readonly name: string) {}
}

// DSP (Demand-Side Platform)
class DSP {
    private creatives: Creative[] = [];
    private budget: number;
    private spentBudget: number = 0;

    constructor(
        private readonly id: string,
        private readonly name: string,
        private readonly dmp: DMP,
        initialBudget: number
    ) {
        this.budget = initialBudget;
    }

    getId(): string {
        return this.id;
    }

    registerCreative(creative: Creative) {
        this.creatives.push(creative);
    }

    async submitBid(request: BidRequest): Promise<BidResponse | null> {
        if (this.spentBudget >= this.budget) {
            return null; // 지정된 예산 초과 시 입찰 포기
        }

        const userSegments = this.dmp.provideSegments(request.impression.userId);
        const eligibleCreatives = this.creatives.filter(creative => 
            this.isCreativeEligible(creative, request, userSegments)
        );

        if (eligibleCreatives.length === 0) {
            return null;
        }

        const bidAmount = this.calculateBid(request, eligibleCreatives[0]); // 실제로는 보다 정교화된 선택 로직으로 소재가 선택된다.
        if (bidAmount <= request.floorPrice) {
            return null;
        }

        return {
            requestId: request.id,
            dspId: this.id,
            bid: bidAmount,
            creative: eligibleCreatives[0]
        };
    }

    private isCreativeEligible(creative: Creative, request: BidRequest, userSegments: string[]): boolean {
        const specMatch = 
            creative.size === request.placement.size &&
            creative.type === request.placement.type;

        const targetMatch = creative.targetSegments.some(segment =>
            userSegments.includes(segment)
        );

        const safetyMatch = !request.placement.context.brandSafety.categories
            .some(category => creative.categories.includes(category));

        return specMatch && targetMatch && safetyMatch;
    }

    private calculateBid(request: BidRequest, creative: Creative): number {
        return request.floorPrice * (1 + Math.random());
    }
}

// Ad Exchange 클래스
class AdExchange {
    private dsps = new Map<string, DSP>();
    private auctionLog = new Map<string, AuctionRecord>();

    constructor(
        private readonly id: string,
        private readonly auctionType: 'first-price' | 'second-price' = 'first-price'
    ) {}

    async registerDSP(dsp: DSP) {
        this.dsps.set(dsp.getId(), dsp);
    }

    async runAuction(request: BidRequest): Promise<BidResponse | null> {
        const eligibleDSPs = Array.from(this.dsps.values());

        const bidPromises = eligibleDSPs.map(dsp =>
            Promise.race([
                dsp.submitBid(request),
                new Promise<null>(resolve =>
                    setTimeout(() => resolve(null), request.timeout)
                )
            ])
        );

        const bids = await Promise.all(bidPromises);
        const validBids = this.validateBids(bids, request);

        if (validBids.length === 0) return null;

        const winner = this.determineWinner(validBids);

        this.recordAuction({
            requestId: request.id,
            timestamp: Date.now(),
            winner: winner,
            allBids: validBids,
            floorPrice: request.floorPrice
        });

        return winner;
    }

    private validateBids(
        bids: (BidResponse | null)[],
        request: BidRequest
    ): BidResponse[] {
        return bids.filter((bid): bid is BidResponse => {
            if (!bid) return false;
            if (bid.bid < request.floorPrice) return false;
            return true;
        });
    }

    private determineWinner(bids: BidResponse[]): BidResponse {
        if (this.auctionType === 'second-price') {
            const sortedBids = [...bids].sort((a, b) => b.bid - a.bid);
            const winner = { ...sortedBids[0] };
            if (sortedBids.length > 1) {
                winner.bid = sortedBids[1].bid;
            }
            return winner;
        } else {
            return bids.reduce((highest, current) =>
                current.bid > highest.bid ? current : highest
            );
        }
    }

    private recordAuction(record: AuctionRecord) {
        this.auctionLog.set(record.requestId, record);
    }
}

// SSP (Supply-Side Platform) 클래스
class SSP {
    private placements = new Map<string, AdPlacement>();

    constructor(
        private readonly id: string,
        private readonly name: string,
        private readonly adExchanges: AdExchange[]
    ) {}

    async registerPlacement(placement: AdPlacement): Promise<void> {
        this.placements.set(placement.id, placement);
    }

    async requestBid(impression: ImpressionContext): Promise<BidResponse | null> {
        const placement = this.placements.get(impression.placementId);
        if (!placement) {
            throw new Error(`Unknown placement: ${impression.placementId}`);
        }

        const adjustedFloorPrice = placement.floorPrice;

        const bidRequest: BidRequest = {
            id: `bid-${Date.now()}`,
            impression,
            placement,
            floorPrice: adjustedFloorPrice,
            timeout: 100
        };

        const bidPromises = this.adExchanges.map(exchange =>
            exchange.runAuction(bidRequest)
        );

        const bids = await Promise.all(bidPromises);
        const validBids = bids.filter((bid): bid is BidResponse => bid !== null);

        if (validBids.length === 0) return null;

        return validBids.reduce((highest, current) =>
            current.bid > highest.bid ? current : highest
        );
    }
}

// 사용 예시
async function demo() {
    // DMP 정의
    const dmp = new DMP();

    // 유저 활동
    dmp.collectUserData('user-1', { type: 'page_visit', url: 'https://underkg.co.kr/' });
    dmp.collectUserData('user-2', { type: 'page_visit', url: 'https://www.spotvnow.co.kr/' });

    // Ad Exchange 정의
    const exchange = new AdExchange('exchange-1', 'second-price');

    // SSP 정의
    const ssp = new SSP('ssp-1', 'MainSSP', [exchange]);

    // DSP 정의
    const dsp = new DSP('dsp-1', 'MainDSP', dmp, 1000000);
    await exchange.registerDSP(dsp);

    // 광고주
    const techAdvertiser: Advertiser = { id: 'advertiser-1', name: 'UNDERKg' };
    const sportsAdvertiser: Advertiser = { id: 'advertiser-2', name: 'SPOTV NOW' };

    const techCreative: Creative = {
        id: 'creative-1',
        advertiserId: techAdvertiser.id,
        type: 'banner',
        size: '300x250',
        content: '<banner>underkg</banner>',
        targetSegments: ['tech-savvy'],
        categories: ['technology'],
        brandName: techAdvertiser.name,
    };
    // DSP 에 광고 소재 등록
    dsp.registerCreative(techCreative);

    const sportsCreative: Creative = {
        id: 'creative-1',
        advertiserId: sportsAdvertiser.id,
        type: 'banner',
        size: '300x250',
        content: '<banner>SPOTV NOW 해외 축구</banner>',
        targetSegments: ['sports-enthusiast'],
        categories: ['sports'],
        brandName: sportsAdvertiser.name
    };
    dsp.registerCreative(sportsCreative);

    // 매체사 정의
    const publisher = new Publisher('pub-1', 'Tech News');
    // 매체사 지면 등록
    ssp.registerPlacement({
        id: 'placement-1',
        publisherId: publisher.id,
        size: '300x250',
        type: 'banner',
        position: 'article_middle',
        floorPrice: 2.5,
        context: {
            section: 'news',
            contentType: 'article',
            category: ['technology', 'mobile'],
            keywords: ['smartphone', '5G', 'review'],
            brandSafety: {
                sensitive: false,
                categories: ['gambling', 'alcohol'],
            },
        },
    });

    // 유저 1 (기술에 관심이 높음) 진입: 매체사 서비스에서 SSP SDK 를 호출
    const result = await ssp.requestBid({
        placementId: 'placement-1',
        userId: 'user-1',
        deviceType: 'desktop',
        timestamp: Date.now(),
        geoLocation: 'KR',
    });

    console.log('기술에 관심이 높은 유저에게 보여지는 광고 소재:', result);

    // 유저 2 (스포츠에 관심이 높음) 진입: 매체사 서비스에서 SSP SDK 를 호출
    const result2 = await ssp.requestBid({
        placementId: 'placement-1',
        userId: 'user-2',
        deviceType: 'desktop',
        timestamp: Date.now(),
        geoLocation: 'KR',
    });

    console.log('스포츠에 관심이 높은 유저에게 보여지는 광고 소재:', result2);
}

demo();
