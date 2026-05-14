import { type FormEvent, useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import {
  formatSchoolGradeLabel,
  SCHOOL_GRADE_CODES,
  SCHOOL_GRADE_OPTIONS,
  type SchoolGradeCode,
} from "../lib/schoolGrade";
import { localDeleteStudent, localInsertStudent } from "../lib/localStoreApi";
import { studentsSectionTitle } from "../lib/studentsSectionTitle";
import { useStudents } from "../hooks/useStudents";

type SortKey =
  | "saved"
  | "nick_asc"
  | "nick_desc"
  | "grade_asc"
  | "grade_desc"
  | "reports_desc"
  | "reports_asc"
  | "created_desc"
  | "created_asc";

function gradeSortIndex(code: string): number {
  const ix = SCHOOL_GRADE_CODES.indexOf(code as SchoolGradeCode);
  return ix >= 0 ? ix : 999;
}

export function StudentsPage() {
  const { user } = useAuth();
  const { students, loading, error, refetch } = useStudents();
  const [nickname, setNickname] = useState("");
  const [grade, setGrade] = useState<SchoolGradeCode>("E1");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [filterGrade, setFilterGrade] = useState<"" | SchoolGradeCode>("");
  const [nameQuery, setNameQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("saved");
  const [listBusyId, setListBusyId] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const nameTrim = nameQuery.trim().toLowerCase();

  const displayedStudents = useMemo(() => {
    let rows = students;
    if (filterGrade) rows = rows.filter((s) => s.student_grade === filterGrade);
    if (nameTrim) rows = rows.filter((s) => s.student_nick.toLowerCase().includes(nameTrim));

    const sorted = [...rows];
    switch (sortKey) {
      case "saved":
        sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case "nick_asc":
        sorted.sort((a, b) => a.student_nick.localeCompare(b.student_nick, "ko"));
        break;
      case "nick_desc":
        sorted.sort((a, b) => b.student_nick.localeCompare(a.student_nick, "ko"));
        break;
      case "grade_asc":
        sorted.sort((a, b) => gradeSortIndex(a.student_grade) - gradeSortIndex(b.student_grade));
        break;
      case "grade_desc":
        sorted.sort((a, b) => gradeSortIndex(b.student_grade) - gradeSortIndex(a.student_grade));
        break;
      case "reports_desc":
        sorted.sort((a, b) => b.total_reports_written - a.total_reports_written);
        break;
      case "reports_asc":
        sorted.sort((a, b) => a.total_reports_written - b.total_reports_written);
        break;
      case "created_desc":
        sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case "created_asc":
        sorted.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        break;
      default:
        break;
    }
    return sorted;
  }, [students, filterGrade, nameTrim, sortKey]);

  const onDelete = useCallback(
    async (studentId: string, nick: string) => {
      if (!window.confirm(`「${nick}」 학생을 삭제할까요? 관련 월간·기간 리포트도 함께 삭제됩니다.`)) return;
      setListError(null);
      setListBusyId(studentId);
      try {
        if (isSupabaseConfigured()) {
          if (!supabase || !user) {
            setListError("로그인 정보가 없습니다.");
            return;
          }
          const { error: delErr } = await supabase
            .from("students")
            .delete()
            .eq("student_id", studentId)
            .eq("user_id", user.user_id);
          if (delErr) throw new Error(delErr.message);
        } else {
          if (!import.meta.env.DEV) {
            setListError("이 환경에서는 로컬 학생 목록을 사용할 수 없습니다.");
            return;
          }
          await localDeleteStudent(studentId);
        }
        await refetch();
      } catch (err) {
        setListError(err instanceof Error ? err.message : String(err));
      } finally {
        setListBusyId(null);
      }
    },
    [refetch, user],
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const nick = nickname.trim();
    if (!nick) {
      setFormError("별명을 입력하세요. (실명 대신 표시용)");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (isSupabaseConfigured()) {
        if (!supabase || !user) {
          setFormError("로그인 정보가 없습니다.");
          return;
        }
        const { error: insErr } = await supabase.from("students").insert({
          user_id: user.user_id,
          student_nick: nick,
          student_grade: grade,
        });
        if (insErr) setFormError(insErr.message);
        else setNickname("");
      } else {
        if (!import.meta.env.DEV) {
          setFormError("이 환경에서는 로컬 학생 추가를 사용할 수 없습니다.");
          return;
        }
        await localInsertStudent({ nickname: nick, student_grade: grade });
        setNickname("");
      }
      await refetch();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{studentsSectionTitle(user?.login_id)}</h1>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}
      {listError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{listError}</p>
      ) : null}

      <form
        onSubmit={onSubmit}
        className="max-w-xl space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <h2 className="text-sm font-semibold text-slate-800">학생 추가</h2>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex-1 text-sm">
            <span className="mb-1 block text-slate-600">별명</span>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="예: 별가루_07"
            />
          </label>
          <label className="w-full text-sm sm:w-36">
            <span className="mb-1 block text-slate-600">학년</span>
            <select
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={grade}
              onChange={(e) => setGrade(e.target.value as SchoolGradeCode)}
            >
              {SCHOOL_GRADE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving ? "저장 중…" : "추가"}
          </button>
        </div>
        {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
      </form>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="space-y-3 border-b border-slate-100 px-4 py-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-semibold text-slate-800">목록</h2>
            <p className="text-xs text-slate-500">
              {students.length > 0
                ? `전체 ${students.length}명 · 표시 ${displayedStudents.length}명`
                : null}
            </p>
          </div>
          <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-end">
            <label className="text-sm lg:w-40">
              <span className="mb-1 block text-slate-600">학년 필터</span>
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={filterGrade}
                onChange={(e) => setFilterGrade(e.target.value === "" ? "" : (e.target.value as SchoolGradeCode))}
              >
                <option value="">전체</option>
                {SCHOOL_GRADE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-0 flex-1 text-sm">
              <span className="mb-1 block text-slate-600">이름(별명) 검색</span>
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={nameQuery}
                onChange={(e) => setNameQuery(e.target.value)}
                placeholder="별명 일부 입력"
              />
            </label>
            <label className="text-sm lg:min-w-[12rem]">
              <span className="mb-1 block text-slate-600">정렬</span>
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
              >
                <option value="saved">기본 순</option>
                <option value="nick_asc">별명 가나다순</option>
                <option value="nick_desc">별명 역순</option>
                <option value="grade_asc">학년 낮은 순</option>
                <option value="grade_desc">학년 높은 순</option>
                <option value="reports_desc">월간 리포트 많은 순</option>
                <option value="reports_asc">월간 리포트 적은 순</option>
                <option value="created_desc">등록일 최신순</option>
                <option value="created_asc">등록일 오래된 순</option>
              </select>
            </label>
          </div>
        </div>
        {loading ? (
          <p className="p-4 text-sm text-slate-500">불러오는 중…</p>
        ) : students.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">등록된 학생이 없습니다.</p>
        ) : displayedStudents.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">조건에 맞는 학생이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {displayedStudents.map((s) => {
              const busy = listBusyId === s.student_id;
              return (
                <li key={s.student_id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">{s.student_nick}</p>
                    <p className="text-xs text-slate-500">
                      {formatSchoolGradeLabel(s.student_grade)} · 월간 {s.total_reports_written}회
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
                    <Link
                      to={`/students/${s.student_id}`}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-slate-50"
                      aria-label={`${s.student_nick} 레포트 작성`}
                    >
                      레포트 생성 →
                    </Link>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onDelete(s.student_id, s.student_nick)}
                      className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      삭제
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
