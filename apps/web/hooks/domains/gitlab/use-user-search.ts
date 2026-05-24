"use client";

import { useQuery } from "@tanstack/react-query";
import { searchUserIssues, searchUserMRs } from "@/lib/api/domains/gitlab-api";
import type { Issue, MR } from "@/lib/types/gitlab";

type SearchState<T> = {
  items: T[];
  loading: boolean;
  error: string | null;
};

function toErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  return fallback;
}

/** Fetch the current user's MRs from GitLab. Re-runs whenever filter, query, or perPage change. */
export function useGitLabUserMRs(filter: string, query: string, perPage = 50): SearchState<MR> {
  const { data, isPending, error } = useQuery({
    queryKey: ["gitlab", "user", "mrs", filter, query, perPage] as const,
    queryFn: () => searchUserMRs({ filter, customQuery: query, perPage }),
    staleTime: 30_000,
  });
  return {
    items: data?.mrs ?? [],
    loading: isPending,
    error: error ? toErrorMessage(error, "Failed to load MRs") : null,
  };
}

/** Fetch the current user's issues from GitLab. Re-runs whenever filter, query, or perPage change. */
export function useGitLabUserIssues(
  filter: string,
  query: string,
  perPage = 50,
): SearchState<Issue> {
  const { data, isPending, error } = useQuery({
    queryKey: ["gitlab", "user", "issues", filter, query, perPage] as const,
    queryFn: () => searchUserIssues({ filter, customQuery: query, perPage }),
    staleTime: 30_000,
  });
  return {
    items: data?.issues ?? [],
    loading: isPending,
    error: error ? toErrorMessage(error, "Failed to load issues") : null,
  };
}
