import { useState, useCallback, useEffect } from 'react';
import { Group, GroupMessage, getUserGroups, getGroupMessages } from '@/src/group';
import { Character } from '@/shared/types';
import { useUser } from '@/constants/UserContext';

export interface GroupState {
  selectedGroupId: string | null;
  groups: Group[];
  groupMessages: GroupMessage[];
  isGroupMode: boolean;
  groupMembers: Character[];
  disbandedGroups: string[];
  groupBackgrounds: Record<string, string | undefined>;
}

interface GroupActions {
  setSelectedGroupId: (id: string | null) => void;
  setGroups: (groups: Group[]) => void;
  setGroupMessages: (messages: GroupMessage[]) => void;
  setIsGroupMode: (isGroupMode: boolean) => void;
  setGroupMembers: (members: Character[]) => void;
  addDisbandedGroup: (groupId: string) => void;
  setGroupBackground: (groupId: string, background: string | undefined) => void;
  loadUserGroups: () => Promise<void>;
  loadGroupMessages: (groupId: string) => Promise<void>;
  handleGroupDisbanded: (groupId: string) => void;
}

const initialGroupState: GroupState = {
  selectedGroupId: null,
  groups: [],
  groupMessages: [],
  isGroupMode: false,
  groupMembers: [],
  disbandedGroups: [],
  groupBackgrounds: {},
};

export const useGroupState = (): [GroupState, GroupActions] => {
  const [state, setState] = useState<GroupState>(initialGroupState);
  const { user } = useUser();

  const setSelectedGroupId = useCallback((id: string | null) => {
    setState(prev => ({ ...prev, selectedGroupId: id }));
  }, []);

  const setGroups = useCallback((groups: Group[]) => {
    setState(prev => ({ ...prev, groups }));
  }, []);

  const setGroupMessages = useCallback((messages: GroupMessage[]) => {
    setState(prev => ({ ...prev, groupMessages: messages }));
  }, []);

  const setIsGroupMode = useCallback((isGroupMode: boolean) => {
    setState(prev => ({ ...prev, isGroupMode }));
  }, []);

  const setGroupMembers = useCallback((members: Character[]) => {
    setState(prev => ({ ...prev, groupMembers: members }));
  }, []);

  const addDisbandedGroup = useCallback((groupId: string) => {
    setState(prev => ({
      ...prev,
      disbandedGroups: [...prev.disbandedGroups, groupId]
    }));
  }, []);

  const setGroupBackground = useCallback((groupId: string, background: string | undefined) => {
    setState(prev => ({
      ...prev,
      groupBackgrounds: {
        ...prev.groupBackgrounds,
        [groupId]: background
      }
    }));
  }, []);

  const loadUserGroups = useCallback(async () => {
    if (!user) return;
    
    try {
      const userGroups = await getUserGroups(user);
      const filteredGroups = userGroups.filter(group => 
        !state.disbandedGroups.includes(group.groupId)
      );
      
      setGroups(filteredGroups);
      console.log(`[GroupState] Loaded ${filteredGroups.length} groups (filtered from ${userGroups.length})`);
    } catch (error) {
      console.error('Failed to load user groups:', error);
    }
  }, [user, state.disbandedGroups]);

  const loadGroupMessages = useCallback(async (groupId: string) => {
    if (!groupId) return;

    try {
      const messages = await getGroupMessages(groupId);
      setGroupMessages(messages);
    } catch (error) {
      console.error('Failed to load group messages:', error);
    }
  }, []);

  const handleGroupDisbanded = useCallback((groupId: string) => {
    console.log(`[GroupState] Group disbanded: ${groupId}`);
    
    addDisbandedGroup(groupId);
    
    if (state.selectedGroupId === groupId) {
      setSelectedGroupId(null);
      setIsGroupMode(false);
    }
  }, [state.selectedGroupId, addDisbandedGroup]);

  // Load groups when user changes
  useEffect(() => {
    if (user) {
      loadUserGroups();
    }
  }, [user, loadUserGroups]);

  const actions: GroupActions = {
    setSelectedGroupId,
    setGroups,
    setGroupMessages,
    setIsGroupMode,
    setGroupMembers,
    addDisbandedGroup,
    setGroupBackground,
    loadUserGroups,
    loadGroupMessages,
    handleGroupDisbanded,
  };

  return [state, actions];
};
