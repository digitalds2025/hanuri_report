import type {
  BriefingFoundationReport,
  BriefingMaterialFormInput,
  BriefingTopicCandidate,
  MasterOutline,
  MasterOutlineBlock,
} from "./briefingMaterialTypes";

/** 줄글 레포트 섹션 → 자료집·DOCX용 마스터 아웃라인 */
export function buildOutlineFromReport(
  input: BriefingMaterialFormInput,
  topic: BriefingTopicCandidate,
  report: BriefingFoundationReport,
): MasterOutline {
  const dataAsOf = input.officialScan?.scannedAt.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const regionLabel = `${input.region} ${input.subRegion}`.trim();
  const purpose =
    input.parentAudience === "신입 모집" ? "신규 모집·문제 인식" : "재원생 성과·승급";

  const sectionBlocks: MasterOutlineBlock[] = report.sections.map((sec) => ({
    blockId: sec.id,
    title: sec.heading,
    purpose: topic.title,
    bulletPoints: sec.body
      .split(/\n+/)
      .map((l) => l.replace(/^[-*#]\s*/, "").trim())
      .filter((l) => l.length > 2)
      .slice(0, 6),
    dataGradesUsed: ["A", "B"],
  }));

  const blocks: MasterOutlineBlock[] = [
    {
      blockId: "cover",
      title: topic.title,
      purpose: `${regionLabel} · ${input.schoolLevel} ${input.targetGrade} · ${purpose}`,
      bulletPoints: [report.title, `기준 시점: ${dataAsOf}`],
      dataGradesUsed: ["A"],
    },
    ...sectionBlocks,
    {
      blockId: "sources",
      title: "출처·기준 시점",
      purpose: "수집 근거",
      bulletPoints: [`지역 자료 기준 시점: ${dataAsOf}`, "학교알리미·교육청·학교 공개 자료"],
      dataGradesUsed: ["A", "B"],
    },
  ];

  return {
    topicId: topic.id,
    topicTitle: topic.title,
    dataAsOf,
    regionLabel,
    targetLabel: `${input.schoolLevel} ${input.targetGrade}`,
    purposeLabel: purpose,
    blocks,
  };
}
