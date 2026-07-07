export type DlsEnvelope<T> = {
  status: string;
  message: string;
  data: T;
};

export type DlsCategory = {
  lCategoryCode: string;
  lCategoryDesc: string;
};

export type DlsBook = {
  bookKey: string;
  speciesKey: string;
  provCode: string;
  neisCode: string;
  title: string;
  author: string;
  publisher: string;
  pubYear: string;
  coverUrl: string;
  isbn: string;
  regNo?: string;
  classNo?: string;
  callNo?: string;
  locationName?: string;
  regDate?: string;
  status?: string;
  description?: string;
  count?: string;
  categoryInfo?: {
    lcode?: string;
    ldesc?: string;
    mcode?: string;
    mdesc?: string;
    scode?: string;
    sdesc?: string;
  };
  kdcInfo?: {
    lcode?: string;
    ldesc?: string;
    mcode?: string;
    mdesc?: string;
    scode?: string;
    sdesc?: string;
  };
};

export type DlsBookState = {
  coverUrl: string;
  status: string;
  locationName: string;
  returnPlanDate: string;
};

export type DlsSearchResult = {
  allTotalCount: number;
  totalCount: number;
  totalPage: number;
  bookList: DlsBook[];
};

export type SearchOptions = {
  keyword?: string;
  searchType?: "TITLE" | "AUTHOR" | "PUBLISHER";
  categoryCode?: string;
  kdcCode?: string;
  page?: number;
  size?: number;
  sort?: "SCORE" | "RECENT" | "TITLE" | "AUTHOR" | "PUBLISHER" | "PUBYEAR";
  order?: "ASC" | "DESC";
};
