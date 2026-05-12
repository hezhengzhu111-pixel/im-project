import { create } from 'zustand';
import { groupService } from '@/services/groups/groupService';
import { useAuthStore } from './authStore';
import type { Group, GroupMember } from '@/types/models';

interface GroupState {
  groups: Group[];
  membersByGroup: Record<string, GroupMember[]>;
  searchResults: Group[];
  loading: boolean;
  loadGroups: () => Promise<void>;
  createGroup: (data: { name: string; description?: string; avatar?: string; memberIds: string[] }) => Promise<Group>;
  searchGroups: (keyword: string) => Promise<void>;
  loadMembers: (groupId: string) => Promise<void>;
  addMembers: (groupId: string, memberIds: string[]) => Promise<void>;
  joinGroup: (groupId: string) => Promise<void>;
  leaveGroup: (groupId: string) => Promise<void>;
  dismissGroup: (groupId: string) => Promise<void>;
  updateGroup: (groupId: string, data: Record<string, unknown>) => Promise<void>;
  clear: () => void;
}

export const useGroupStore = create<GroupState>((set, get) => ({
  groups: [],
  membersByGroup: {},
  searchResults: [],
  loading: false,

  async loadGroups() {
    const userId = useAuthStore.getState().currentUser?.id;
    if (!userId) {
      set({ groups: [] });
      return;
    }
    set({ loading: true });
    try {
      const response = await groupService.getList(userId);
      set({ groups: response.data });
    } finally {
      set({ loading: false });
    }
  },

  async createGroup(data) {
    const response = await groupService.create(data);
    await get().loadGroups();
    return response.data;
  },

  async searchGroups(keyword) {
    const response = await groupService.searchGroups(keyword);
    set({ searchResults: response.data });
  },

  async loadMembers(groupId) {
    const response = await groupService.getMembers(groupId);
    set({ membersByGroup: { ...get().membersByGroup, [groupId]: response.data } });
  },

  async addMembers(groupId, memberIds) {
    await groupService.addMembers(groupId, memberIds);
    await get().loadMembers(groupId);
  },

  async joinGroup(groupId) {
    await groupService.join(groupId);
    await get().loadGroups();
  },

  async leaveGroup(groupId) {
    await groupService.quit(groupId);
    set({ groups: get().groups.filter((group) => group.id !== groupId) });
  },

  async dismissGroup(groupId) {
    await groupService.dismiss(groupId);
    set({ groups: get().groups.filter((group) => group.id !== groupId) });
  },

  async updateGroup(groupId, data) {
    await groupService.update(groupId, data, useAuthStore.getState().currentUser?.id);
    await get().loadGroups();
  },

  clear() {
    set({ groups: [], membersByGroup: {}, searchResults: [] });
  },
}));
