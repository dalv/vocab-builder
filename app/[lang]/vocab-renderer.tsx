import type { Section, WordEntry, PairEntry, Example } from "./types";
import type { Lang } from "../lib/cards";
import { wordCardId, pairSideCardId } from "../lib/cards";
import type { MasteryLevel } from "../lib/srs";
import SignalBars from "../components/SignalBars";

type MasteryMap = Map<string, MasteryLevel> | null;

function ExampleBlock({ ex }: { ex: Example }) {
  return (
    <div className="example">
      <span className="ex-indo">{ex.target}</span>
      <br />
      {ex.pinyin && (
        <>
          <span className="ex-pinyin">{ex.pinyin}</span>
          <br />
        </>
      )}
      <span className="ex-eng">{ex.eng}</span>
    </div>
  );
}

function WordCard({
  entry,
  lang,
  sectionId,
  masteryMap,
}: {
  entry: WordEntry;
  lang?: Lang;
  sectionId: string;
  masteryMap: MasteryMap;
}) {
  const level =
    masteryMap && lang
      ? (masteryMap.get(wordCardId(lang, sectionId, entry.word)) ?? 0)
      : null;
  return (
    <div className="word-card">
      {level !== null && (
        <SignalBars
          level={level}
          className="card-signal"
          title={`Mastery ${level}/3`}
        />
      )}
      <div className="word-row">
        <span className="indo-word">{entry.word}</span>
        {entry.pinyin && <span className="pinyin">{entry.pinyin}</span>}
        <span className="eng-word">{entry.eng}</span>
        {entry.tag && <span className="note-tag">{entry.tag}</span>}
      </div>
      {entry.examples.map((ex, i) => (
        <ExampleBlock key={i} ex={ex} />
      ))}
    </div>
  );
}

function PairCard({
  entry,
  lang,
  sectionId,
  masteryMap,
}: {
  entry: PairEntry;
  lang?: Lang;
  sectionId: string;
  masteryMap: MasteryMap;
}) {
  const leftLevel =
    masteryMap && lang
      ? (masteryMap.get(pairSideCardId(lang, sectionId, "left", entry.left.word)) ?? 0)
      : null;
  const rightLevel =
    masteryMap && lang
      ? (masteryMap.get(pairSideCardId(lang, sectionId, "right", entry.right.word)) ?? 0)
      : null;

  return (
    <div className="pair-card">
      <div className="pair-row">
        <div className="pair-side">
          {leftLevel !== null && (
            <SignalBars
              level={leftLevel}
              className="card-signal pair-signal"
              title={`Mastery ${leftLevel}/3`}
            />
          )}
          <span className="indo-word">{entry.left.word}</span>
          {entry.left.pinyin && <span className="pinyin">{entry.left.pinyin}</span>}
          <span className="eng-word">{entry.left.eng}</span>
        </div>
        <span className="pair-divider">↔</span>
        <div className="pair-side">
          {rightLevel !== null && (
            <SignalBars
              level={rightLevel}
              className="card-signal pair-signal"
              title={`Mastery ${rightLevel}/3`}
            />
          )}
          <span className="indo-word">{entry.right.word}</span>
          {entry.right.pinyin && <span className="pinyin">{entry.right.pinyin}</span>}
          <span className="eng-word">{entry.right.eng}</span>
        </div>
      </div>
      <div className="pair-examples">
        <ExampleBlock ex={entry.examples[0]} />
        <ExampleBlock ex={entry.examples[1]} />
      </div>
    </div>
  );
}

function renderEntries(
  lang: Lang | undefined,
  sectionId: string,
  masteryMap: MasteryMap,
  words?: WordEntry[],
  pairs?: PairEntry[],
) {
  return (
    <>
      {words?.map((w, i) => (
        <WordCard
          key={i}
          entry={w}
          lang={lang}
          sectionId={sectionId}
          masteryMap={masteryMap}
        />
      ))}
      {pairs?.map((p, i) => (
        <PairCard
          key={i}
          entry={p}
          lang={lang}
          sectionId={sectionId}
          masteryMap={masteryMap}
        />
      ))}
    </>
  );
}

export default function VocabRenderer({
  sections,
  totalLabel,
  lang,
  masteryMap = null,
}: {
  sections: Section[];
  totalLabel: string;
  lang?: Lang;
  masteryMap?: MasteryMap;
}) {
  return (
    <div className="container">
      {sections.map((section) => (
        <div className="section" id={section.id} key={section.id}>
          <div className="section-header">
            <h2>{section.title}</h2>
            <span className="count">{section.count}</span>
          </div>
          <p className="section-note">{section.note}</p>

          {section.subsections?.map((sub, i) => (
            <span key={i}>
              <div className="subsection">
                <h3>{sub.title}</h3>
              </div>
              {renderEntries(lang, section.id, masteryMap, sub.words, sub.pairs)}
            </span>
          ))}

          {renderEntries(lang, section.id, masteryMap, section.words, section.pairs)}
        </div>
      ))}

      <div
        style={{
          textAlign: "center",
          padding: "40px 16px 20px",
          color: "var(--text-muted)",
          fontSize: "13px",
        }}
      >
        {totalLabel}
      </div>
    </div>
  );
}
