
export type Poem = {
  id: string;
  title: string;
  text: string;
  language: string;
  createdAt: string;
};

export type LiteraryProfile = {
  summary: string;
  themes: string[];
  imagery: string[];
  emotionalTones: string[];
  reflectionStyle: string[];
};

export type MatchProfile = {
  id: string;
  nickname: string;
  sharedThemes: string[];
  explanation: string;
};

export type UserProfile = {
  id: string;
  nickname: string;
  bio: string;
  poems: Poem[];
  literaryProfile: LiteraryProfile | null;
  isDiscoverable: boolean;
};
