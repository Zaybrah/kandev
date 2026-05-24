"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createAutomation,
  updateAutomation as apiUpdateAutomation,
  deleteAutomation,
  enableAutomation,
  disableAutomation,
  triggerAutomation,
} from "@/lib/api/domains/automation-api";
import { automationsQueryOptions } from "@/lib/query/query-options/automations";
import { qk } from "@/lib/query/keys";
import type {
  CreateAutomationRequest,
  UpdateAutomationRequest,
  Automation,
} from "@/lib/types/automation";

export function useAutomations(workspaceId: string | null) {
  const qc = useQueryClient();
  const safeId = workspaceId ?? "";

  const { data, isLoading } = useQuery({
    ...automationsQueryOptions.list(safeId),
    enabled: !!workspaceId,
  });

  const items = data ?? [];

  const createMutation = useMutation({
    mutationFn: (req: CreateAutomationRequest) => createAutomation(req),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.automations.prefix(safeId) });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, req }: { id: string; req: UpdateAutomationRequest }) =>
      apiUpdateAutomation(id, req),
    onSuccess: (updated) => {
      qc.setQueryData(qk.automations.list(safeId), (prev: Automation[] | undefined) =>
        prev ? prev.map((a) => (a.id === updated.id ? updated : a)) : [updated],
      );
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => deleteAutomation(id),
    onSuccess: (_data, id) => {
      qc.setQueryData(
        qk.automations.list(safeId),
        (prev: Automation[] | undefined) => prev?.filter((a) => a.id !== id) ?? [],
      );
    },
  });

  const enableMutation = useMutation({
    mutationFn: (id: string) => enableAutomation(id),
    onSuccess: (updated) => {
      qc.setQueryData(qk.automations.list(safeId), (prev: Automation[] | undefined) =>
        prev ? prev.map((a) => (a.id === updated.id ? updated : a)) : [updated],
      );
    },
  });

  const disableMutation = useMutation({
    mutationFn: (id: string) => disableAutomation(id),
    onSuccess: (updated) => {
      qc.setQueryData(qk.automations.list(safeId), (prev: Automation[] | undefined) =>
        prev ? prev.map((a) => (a.id === updated.id ? updated : a)) : [updated],
      );
    },
  });

  const triggerMutation = useMutation({
    mutationFn: (id: string) => triggerAutomation(id),
  });

  const create = (req: CreateAutomationRequest) => createMutation.mutateAsync(req);
  const update = (id: string, req: UpdateAutomationRequest) =>
    updateMutation.mutateAsync({ id, req });
  const remove = (id: string) => removeMutation.mutateAsync(id);
  const enable = (id: string) => enableMutation.mutateAsync(id);
  const disable = (id: string) => disableMutation.mutateAsync(id);
  const trigger = (id: string) => triggerMutation.mutateAsync(id);

  const refresh = () => {
    if (workspaceId) {
      void qc.invalidateQueries({ queryKey: qk.automations.list(safeId) });
    }
  };

  return { items, loading: isLoading, create, update, remove, enable, disable, trigger, refresh };
}
