import { create } from 'zustand';
import { friendService } from '@/services/contacts/friendService';
import { userService } from '@/services/user/userService';
import type { FriendRequest, Friendship, User } from '@im/shared-types';

interface ContactState {
  friends: Friendship[];
  friendRequests: FriendRequest[];
  searchResults: User[];
  loading: boolean;
  loadFriends: () => Promise<void>;
  loadFriendRequests: () => Promise<void>;
  searchUsers: (keyword: string, type?: string) => Promise<void>;
  addFriend: (userId: string, message?: string) => Promise<void>;
  acceptRequest: (requestId: string) => Promise<void>;
  rejectRequest: (requestId: string) => Promise<void>;
  deleteFriend: (friendId: string) => Promise<void>;
  updateRemark: (friendId: string, remark: string) => Promise<void>;
  clear: () => void;
}

const pendingRequestsOnly = (requests: FriendRequest[]) =>
  requests.filter((request) => request.status === 'PENDING');

const removeRequestById = (requests: FriendRequest[], requestId: string) =>
  requests.filter((request) => request.id !== requestId);

export const useContactStore = create<ContactState>((set, get) => ({
  friends: [],
  friendRequests: [],
  searchResults: [],
  loading: false,

  async loadFriends() {
    set({ loading: true });
    try {
      const response = await friendService.getList();
      set({ friends: response.data });
    } finally {
      set({ loading: false });
    }
  },

  async loadFriendRequests() {
    const response = await friendService.getRequests();
    set({ friendRequests: pendingRequestsOnly(response.data) });
  },

  async searchUsers(keyword, type = 'username') {
    const response = await userService.search(keyword, type);
    set({ searchResults: response.data });
  },

  async addFriend(userId, message) {
    await friendService.add({ userId, message });
  },

  async acceptRequest(requestId) {
    const previousRequests = get().friendRequests;
    set({ friendRequests: removeRequestById(previousRequests, requestId) });
    try {
      await friendService.handleRequest({ requestId, action: 'ACCEPT' });
      await get().loadFriends();
      await get().loadFriendRequests();
    } catch (error) {
      set({ friendRequests: previousRequests });
      throw error;
    }
  },

  async rejectRequest(requestId) {
    const previousRequests = get().friendRequests;
    set({ friendRequests: removeRequestById(previousRequests, requestId) });
    try {
      await friendService.handleRequest({ requestId, action: 'REJECT' });
      await get().loadFriendRequests();
    } catch (error) {
      set({ friendRequests: previousRequests });
      throw error;
    }
  },

  async deleteFriend(friendId) {
    await friendService.delete(friendId);
    set({ friends: get().friends.filter((friend) => friend.friendId !== friendId) });
  },

  async updateRemark(friendId, remark) {
    await friendService.updateRemark(friendId, remark);
    set({
      friends: get().friends.map((friend) => (friend.friendId === friendId ? { ...friend, remark } : friend)),
    });
  },

  clear() {
    set({ friends: [], friendRequests: [], searchResults: [] });
  },
}));
