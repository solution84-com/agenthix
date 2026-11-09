import { action, page, query, route, type Spec } from "@wasp.sh/spec";
import { getConversations, getConversation, getConversationMessages } from "./conversationQueries" with { type: "ref" };
import { getLastWrittenConversation } from "./lastWritten" with { type: "ref" };
import { getConversationInbox } from "./inbox/getConversationInbox" with { type: "ref" };
import { getPrimaryAgent, setPrimaryAgent, getConversationAgentChoices } from "./primaryAgent" with { type: "ref" };
import { startConversation } from "./startConversation" with { type: "ref" };
import { sendConversationMessage } from "./sendMessage" with { type: "ref" };
import { shareConversationFile } from "./shared/shareFileAction" with { type: "ref" };
import { stopConversationTurn } from "./stopTurn" with { type: "ref" };
import { sendWaitingConversationMessageNow, cancelWaitingConversationMessage } from "./waitingMessages" with { type: "ref" };
import { switchConversationAccess } from "./switchAccess" with { type: "ref" };
import { getModelChoices, setConversationModel } from "./modelChoice" with { type: "ref" };
import { getConversationActivity, getOperationResult } from "./work/activity" with { type: "ref" };
import { getAnswerFacts } from "./answerFacts" with { type: "ref" };
import { getReplyVoice, speakAnswer } from "./voice/listen" with { type: "ref" };
import { answerConversationApproval, cancelConversationOperation } from "./work/answerAndStop" with { type: "ref" };
import { getConversationDeletePreview, deleteConversation, archiveConversation } from "./work/deleting" with { type: "ref" };
import { getConversationSegment, summariseConversationNow } from "./long/segmentOperations" with { type: "ref" };
import { getTaskConversation, startTaskConversation, getTaskThreadMarks, markConversationRead } from "./taskThread/operations" with { type: "ref" };
import { renameConversation } from "./rename" with { type: "ref" };
import { setConversationKeep, reopenConversation, getArchivedConversations, searchConversationRuns } from "./archive/operations" with { type: "ref" };
import { getConversationPlaces, addConversationPlace, removeConversationPlace } from "./placesOperations" with { type: "ref" };
import { findConversationFilesQuery as findConversationFiles } from "./findConversationFiles" with { type: "ref" };
import { listConversationSkillsQuery as listConversationSkills, listStartSkillsQuery as listStartSkills } from "./listConversationSkills" with { type: "ref" };
import { ChatThreadPage } from "./pages/ChatThreadPage" with { type: "ref" };
import { ProjectThreadPage } from "./pages/ProjectThreadPage" with { type: "ref" };
import { VoiceLabPage } from "./voiceClient/lab/VoiceLabPage" with { type: "ref" };
import { VoicePlaygroundPage } from "./voiceClient/playground/VoicePlaygroundPage" with { type: "ref" };

export const conversationsSpec: Spec = [
    route("ChatThreadRoute", "/chat/t/:conversationId", page(ChatThreadPage, { authRequired: true })),
    route("ProjectThreadRoute", "/projects/:key/t/:conversationId", page(ProjectThreadPage, { authRequired: true })),
    route("VoiceLabRoute", "/dev/voice-lab", page(VoiceLabPage, { authRequired: true })),
    route("VoicePlaygroundRoute", "/dev/voice-playground", page(VoicePlaygroundPage, { authRequired: true })),
    query(getConversations, { entities: ["Conversation", "Agent"] }),
    query(getConversation, { entities: ["Conversation", "ConversationMessage", "InferenceTurn", "Agent"] }),
    query(getConversationMessages, { entities: ["ConversationMessage"] }),
    query(getLastWrittenConversation, { entities: ["Conversation", "ConversationMessage"] }),
    // The chat's bar and its Conversations list: every conversation the person can open, with what is going on in it.
    query(getConversationInbox, { entities: ["Conversation", "ConversationMessage", "ConversationReader", "Operation", "Project", "Agent"] }),
    query(getPrimaryAgent, { entities: ["UserSettings", "Agent"] }),
    query(getConversationAgentChoices, { entities: ["Agent", "Project", "ProjectAgent"] }),
    action(startConversation, { entities: ["Conversation", "ConversationMessage"] }),
    action(setPrimaryAgent, { entities: ["UserSettings", "Agent"] }),
    action(sendConversationMessage, { entities: ["Conversation", "ConversationMessage", "InferenceTurn", "UserSettings"] }),
    // A photo or file added to the message box, kept in the place's Shared in conversations/ before the message is sent.
    action(shareConversationFile, { entities: ["Conversation", "Project"] }),
    action(stopConversationTurn, { entities: ["Conversation", "InferenceTurn"] }),
    action(sendWaitingConversationMessageNow, { entities: ["Conversation", "ConversationMessage", "InferenceTurn"] }),
    action(cancelWaitingConversationMessage, { entities: ["Conversation", "ConversationMessage"] }),
    action(switchConversationAccess, { entities: ["Conversation", "ConversationMessage", "InferenceTurn"] }),
    query(getModelChoices, { entities: ["Conversation", "AiProvider", "Org", "Agent", "ModelList", "BillingProfile"] }),
    action(setConversationModel, { entities: ["Conversation", "ConversationMessage"] }),
    query(getConversationActivity, { entities: ["Conversation", "Operation"] }),
    query(getOperationResult, { entities: ["Conversation", "Operation"] }),
    // Under an answer: what it used (its turn's record), and the speaker that reads it aloud in the agent's voice.
    query(getAnswerFacts, { entities: ["Conversation", "InferenceTurn"] }),
    query(getReplyVoice, { entities: ["Conversation", "Agent"] }),
    action(speakAnswer, { entities: ["Conversation", "ConversationMessage"] }),
    action(answerConversationApproval, { entities: ["Conversation", "ConversationMessage", "Operation"] }),
    action(cancelConversationOperation, { entities: ["Conversation", "ConversationMessage", "Operation"] }),
    query(getConversationDeletePreview, { entities: ["Conversation", "Operation"] }),
    action(deleteConversation, { entities: ["Conversation", "Operation", "AgentSession"] }),
    action(archiveConversation, { entities: ["Conversation"] }),
    query(getConversationSegment, { entities: ["Conversation", "ConversationSegment"] }),
    action(summariseConversationNow, { entities: ["Conversation", "ConversationSegment", "ConversationMessage"] }),
    query(getTaskConversation, { entities: ["Conversation", "Task"] }),
    action(startTaskConversation, { entities: ["Conversation", "ConversationMessage", "Task"] }),
    query(getTaskThreadMarks, { entities: ["Conversation", "ConversationReader", "Task"] }),
    action(markConversationRead, { entities: ["Conversation", "ConversationReader"] }),
    action(setConversationKeep, { entities: ["Conversation"] }),
    action(renameConversation, { entities: ["Conversation"] }),
    action(reopenConversation, { entities: ["Conversation"] }),
    query(getArchivedConversations, { entities: ["Conversation", "Agent"] }),
    query(searchConversationRuns, { entities: ["Conversation", "Operation"] }),
    query(getConversationPlaces, { entities: ["Conversation", "ConversationPlace", "Project"] }),
    action(addConversationPlace, { entities: ["Conversation", "ConversationPlace"] }),
    action(removeConversationPlace, { entities: ["Conversation", "ConversationPlace"] }),
    // The message box's @ picker: the own place's files by name, from its site, after the access check.
    query(findConversationFiles, { entities: ["Conversation", "Project"] }),
    // The message box's / picker: the skills the conversation's agent would have, from hq's records alone.
    query(listConversationSkills, { entities: ["Conversation", "Asset", "PlaceSkill", "Project"] }),
    query(listStartSkills, { entities: ["Agent", "Asset", "PlaceSkill", "Project"] }),
];
