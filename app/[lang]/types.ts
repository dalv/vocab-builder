export type Example = {
  target: string;
  pinyin?: string;
  eng: string;
};

export type WordEntry = {
  word: string;
  pinyin?: string;
  eng: string;
  tag?: string;
  examples: Example[];
};

export type PairEntry = {
  left: { word: string; pinyin?: string; eng: string };
  right: { word: string; pinyin?: string; eng: string };
  examples: [Example, Example];
};

export type Subsection = {
  title: string;
  words?: WordEntry[];
  pairs?: PairEntry[];
};

export type Section = {
  id: string;
  title: string;
  count: string;
  note: string;
  subsections?: Subsection[];
  words?: WordEntry[];
  pairs?: PairEntry[];
};
