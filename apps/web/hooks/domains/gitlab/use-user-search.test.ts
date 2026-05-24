import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, waitFor } from "@testing-library/react";
import { renderHookWithQueryClient } from "@/test-utils/render-with-query";
import type { Issue, MR, MRSearchPage, IssueSearchPage } from "@/lib/types/gitlab";

const searchUserMRsMock = vi.fn<[unknown], Promise<MRSearchPage | null>>();
const searchUserIssuesMock = vi.fn<[unknown], Promise<IssueSearchPage | null>>();

vi.mock("@/lib/api/domains/gitlab-api", () => ({
  searchUserMRs: (args: unknown) => searchUserMRsMock(args),
  searchUserIssues: (args: unknown) => searchUserIssuesMock(args),
}));

import { useGitLabUserIssues, useGitLabUserMRs } from "./use-user-search";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function fakeMR(): MR {
  return {
    id: 1,
    iid: 1,
    project_id: 1,
    title: "",
    url: "",
    web_url: "",
    state: "opened",
    head_branch: "feat",
    head_sha: "",
    base_branch: "main",
    author_username: "alice",
    project_namespace: "acme",
    project_path: "acme/api",
    body: "",
    draft: false,
    merge_status: "",
    has_conflicts: false,
    additions: 0,
    deletions: 0,
    reviewers: [],
    assignees: [],
    created_at: "",
    updated_at: "",
  };
}

function fakeIssue(): Issue {
  return {
    id: 1,
    iid: 1,
    project_id: 1,
    title: "",
    body: "",
    url: "",
    web_url: "",
    state: "opened",
    author_username: "alice",
    project_namespace: "acme",
    project_path: "acme/api",
    labels: [],
    assignees: [],
    created_at: "",
    updated_at: "",
  };
}

// ---------------------------------------------------------------------------
// useGitLabUserMRs
// ---------------------------------------------------------------------------
describe("useGitLabUserMRs", () => {
  beforeEach(() => {
    searchUserMRsMock.mockReset();
  });

  it("forwards filter, query, and perPage to the API", async () => {
    searchUserMRsMock.mockResolvedValueOnce({ mrs: [], total_count: 0, page: 1, per_page: 25 });
    renderHookWithQueryClient(() => useGitLabUserMRs("authored", "labels=bug", 25));
    await waitFor(() => expect(searchUserMRsMock).toHaveBeenCalledTimes(1));
    expect(searchUserMRsMock).toHaveBeenCalledWith({
      filter: "authored",
      customQuery: "labels=bug",
      perPage: 25,
    });
  });

  it("populates items on success and clears loading", async () => {
    const mr = fakeMR();
    searchUserMRsMock.mockResolvedValueOnce({ mrs: [mr], total_count: 1, page: 1, per_page: 50 });
    const { result } = renderHookWithQueryClient(() => useGitLabUserMRs("a", ""));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([mr]);
    expect(result.current.error).toBeNull();
  });

  it("surfaces an error message and empty items on rejection", async () => {
    searchUserMRsMock.mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHookWithQueryClient(() => useGitLabUserMRs("a", ""));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("boom");
    expect(result.current.items).toEqual([]);
  });

  it("re-fetches when filter changes", async () => {
    searchUserMRsMock.mockResolvedValue({ mrs: [], total_count: 0, page: 1, per_page: 50 });
    const { rerender } = renderHookWithQueryClient(
      ({ filter }: { filter: string }) => useGitLabUserMRs(filter, ""),
      { initialProps: { filter: "a" } },
    );
    await waitFor(() => expect(searchUserMRsMock).toHaveBeenCalledTimes(1));
    rerender({ filter: "b" });
    await waitFor(() => expect(searchUserMRsMock).toHaveBeenCalledTimes(2));
  });
});

// ---------------------------------------------------------------------------
// useGitLabUserIssues
// ---------------------------------------------------------------------------
describe("useGitLabUserIssues", () => {
  beforeEach(() => {
    searchUserIssuesMock.mockReset();
  });

  it("forwards args and returns items", async () => {
    const issue = fakeIssue();
    searchUserIssuesMock.mockResolvedValueOnce({
      issues: [issue],
      total_count: 1,
      page: 1,
      per_page: 50,
    });
    const { result } = renderHookWithQueryClient(() => useGitLabUserIssues("assigned_to_me", ""));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([issue]);
  });

  it("handles rejection without populating items", async () => {
    searchUserIssuesMock.mockRejectedValueOnce(new Error("net"));
    const { result } = renderHookWithQueryClient(() => useGitLabUserIssues("a", ""));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("net");
    expect(result.current.items).toEqual([]);
  });
});
