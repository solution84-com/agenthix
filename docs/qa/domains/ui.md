---
name: Domain map — ui
description: Feature-domain carving of the ui module for a QA audit's accuracy code pass. Stable domain order keeps US-numbering stable across runs. Written 2026-11-03 from the source tree; update when files are added, moved or removed.
updated: 2026-11-03
---

# Domain map — `ui/`

12 domains. Every source file of `ui/` (`@agenthix/ui`) belongs to exactly one domain below or to the excluded list. `ui/` is the shared React component library and design tokens consumed by `hq` and `console-web`; the "operations" of each domain are the exported components and hooks. Each subagent reads only its files; the one-line scope is what every other subagent receives for overlap awareness. The rules every component follows (tokens only, no hex colours, no dark-only assumption) are in `ui/AGENTS.md` and `ui/DESIGN-SYSTEM.md`. The library has no server of its own: what it must get right is what it shows, what it lets a person send, and how it renders content that came from elsewhere.

| # | Domain | Aggregate root(s) or concern | One-line scope |
|---|---|---|---|
| 1 | Design tokens, brand & code editor | theme tokens, Logo, CodeEditor | the single source of every colour and font token (dark and light), the logo, logomark and wordmark, the code editor and its theme and language, and the package entry point |
| 2 | Primitives | generic atoms | buttons, inputs, selects, modals, avatars, badges, pills, empty states, filter controls, inline edit, site selectors and other atoms with no domain knowledge |
| 3 | Agents: profile, configuration & project agents | agent screens | an agent's profile card, create and manage forms, override form, model choice, prompt and configuration tabs, skills tab, and an agent as seen inside a project |
| 4 | Agent permissions & tool approvals | permission views | the permissions screen: tool groups and rows, presets, risk notes, labels, the permissions model, the approval cards and the system-capabilities section |
| 5 | Boards & timeline | Board, Timeline | the board in its views (cards, columns, stacked, chips), columns editing and menus, sprints, show-also, new board form, and the timeline with its bars, rows, agenda and drag |
| 6 | Tasks: lists, panel & forms | Task | task lists and views, filters, the task panel and its meta sidebar, creation and scheduling forms, comments, badges, pickers and the task tool |
| 7 | Automation & routines | ProjectAutomation, Routine | a boundary's automation settings: overview, rules, limits, switch and header, and routines with their form, rule fields, rounds and squares |
| 8 | Projects, products & programs | Project, Product, Program | project cards, header, tab bar, picker, stats, progress and agents list, place cards and file-tool parts, project creation, and the product and program lists, cards and detail screens |
| 9 | People & dashboard | Person, dashboard | a project's people: lists, profile cards, add and remove views, last-admin rule and lines; and the dashboard widgets: stats, costs, runs, activity, system load and the site filter |
| 10 | Conversation transcript & replies | AgentSession (display) | how a conversation reads: messages and items, live and streaming replies, reply blocks and actions, folded work lines, the transcript, mentions, memory bar, usage button, and the hooks that run it on the socket |
| 11 | Chat panel, task sessions & approvals | chat panel | the docked and floating chat panel: header, composer, session and activity lists, the popup, task sessions, and the cards where a person approves or rejects a run's manifest or a tool call |
| 12 | File viewing & diff | file renderers | showing a file by kind: the frame and renderer registry, the code, image, JSON, Markdown, PDF, table and text renderers, read-failure states, and the diff and change list |

---

## Domain scopes (files + operations)

### 1. Design tokens, brand & code editor
- **Files (10):** `src/brand/` (Logo.tsx, Logomark.tsx, Wordmark.tsx, index.ts); `src/editor/` (CodeEditor.tsx, editorLanguage.ts, editorTheme.ts, index.ts); `src/` (index.ts); `src/theme/` (tokens.css)
- **Ops:** `Logo`, `Logomark`, `Wordmark`, `CodeEditor`, `editorLanguage`, `editorTheme`; the `--color-*`, type-scale and `font-mono` tokens in `tokens.css`; the barrel `src/index.ts`
- **Note:** Consumed by `hq` and `console-web` (which selects its own token values with `data-portal="fleet-console"`). The token file is the rule for every colour in every other domain.

### 2. Primitives
- **Files (22):** `src/primitives/` (Avatar.tsx, Button.tsx, EmptyState.tsx, FilterControls.tsx, FormField.tsx, HostingBadge.tsx, InlineEdit.tsx, Input.tsx, Modal.tsx, NativeSelect.tsx, PanelItem.tsx, PlaceAvatar.tsx, PrioritySelector.tsx, Select.tsx, SiteSelector.tsx, StatCard.tsx, StatePill.tsx, Textarea.tsx, UnansweredSitesNotice.tsx, ViewHeaderSlot.tsx, copyText.ts, index.ts)
- **Ops:** `Avatar`, `Button`, `EmptyState`, `FilterControls`, `FormField`, `HostingBadge`, `InlineEdit`, `Input`, `Modal`, `NativeSelect`, `PanelItem`, `PlaceAvatar`, `PrioritySelector`, `Select`, `SiteSelector`, `StatCard`, `StatePill`, `Textarea`, `UnansweredSitesNotice`, `ViewHeaderSlot`, `copyText`
- **Note:** Consumed by every other domain, `hq` and `console-web`.

### 3. Agents: profile, configuration & project agents
- **Files (26):** `src/agents/` (AgentManageHeader.tsx, AgentOverrideForm.tsx, CreateAgentModal.tsx, MdFileEditor.tsx, ModelSelect.tsx, ProfileCard.tsx, ProjectAgentAssign.tsx, ProjectAgentInstructions.tsx, ProjectAgentParts.tsx, ProjectAgentRemove.tsx, ProjectAgentView.tsx, SkillLibraryPicker.tsx, agentNowLines.ts, aiMetrics.ts, helpers.tsx, index.ts, mcpTools.ts, modelGroups.ts, projectAgentTypes.ts, promptSections.ts, runtimeTools.ts, sanitizeHandle.ts, types.ts); `src/agents/tabs/` (ConfigurationTab.tsx, PromptTab.tsx, SkillsTab.tsx, voiceFilters.ts)
- **Ops:** `AgentManageHeader`, `AgentOverrideForm`, `CreateAgentModal`, `MdFileEditor`, `ModelSelect`, `ProfileCard`, `ProjectAgentAssign`, `ProjectAgentInstructions`, `ProjectAgentRemove`, `ProjectAgentView`, `SkillLibraryPicker`, `ConfigurationTab`, `PromptTab`, `SkillsTab`
- **Note:** Consumed by `hq`.

### 4. Agent permissions & tool approvals
- **Files (15):** `src/agents/` (permissionTypes.ts, toolPermissions.ts); `src/agents/permissions/` (AgentPermissionsView.tsx, ApprovalCards.tsx, PermissionsSummary.tsx, PresetChips.tsx, ToolGroups.tsx, ToolRows.tsx, permissionsModel.ts, permissionsTypes.ts, riskNotes.ts, toolLabels.ts); `src/agents/tabs/` (SystemCapabilitiesSection.tsx, ToolStateToggle.tsx, permissionPresets.ts)
- **Ops:** `AgentPermissionsView`, `ApprovalCards`, `PermissionsSummary`, `PresetChips`, `ToolGroups`, `ToolRows`, `ToolStateToggle`, `SystemCapabilitiesSection`, `permissionsModel`, `riskNotes`, `toolLabels`, `toolPermissions`
- **Note:** Shows and edits what an agent may do; the rules themselves are enforced server-side. Consumed by `hq`.

### 5. Boards & timeline
- **Files (34):** `src/board/` (BoardBox.tsx, BoardCardView.tsx, BoardColumnsView.tsx, BoardsList.tsx, ChipColumns.tsx, ColumnBar.tsx, ColumnHeader.tsx, ColumnMenu.tsx, EditColumnsModal.tsx, FinishSprintForm.tsx, KanbanColumns.tsx, NewBoardForm.tsx, RoundLineBar.tsx, ShowAlso.tsx, SprintTag.tsx, StackedColumns.tsx, cardState.ts, columnsModel.ts, index.ts, types.ts, useBacklogFold.ts, useElementWidth.ts); `src/timeline/` (TaskBar.tsx, Timeline.tsx, TimelineAgenda.tsx, TimelineRows.tsx, TimelineToolbar.tsx, agenda.ts, barStyle.ts, index.ts, layout.ts, rows.ts, types.ts, useBarDrag.ts)
- **Ops:** `BoardBox`, `BoardCardView`, `BoardColumnsView`, `BoardsList`, `ChipColumns`, `ColumnBar`, `ColumnHeader`, `ColumnMenu`, `EditColumnsModal`, `FinishSprintForm`, `KanbanColumns`, `NewBoardForm`, `RoundLineBar`, `ShowAlso`, `SprintTag`, `StackedColumns`, `Timeline`, `TaskBar`, `TimelineAgenda`, `TimelineRows`, `TimelineToolbar`, `useBarDrag`
- **Note:** Consumed by `hq`.

### 6. Tasks: lists, panel & forms
- **Files (25):** `src/tasks/` (AgentPicker.tsx, CommentsSection.tsx, CreateTaskModal.tsx, KeyBadge.tsx, NewTaskRow.tsx, OverflowMenu.tsx, PriorityBadge.tsx, RunStateBadge.tsx, StatusBadge.tsx, TaskDetailState.ts, TaskFilterBar.tsx, TaskInTool.tsx, TaskMetaSidebar.tsx, TaskPanel.tsx, TaskScheduleEditor.tsx, TaskSessionView.tsx, TaskViews.tsx, TasksList.tsx, TasksToolHeader.tsx, TasksToolParts.tsx, index.ts, priorityColors.ts, runState.ts, sessionRuns.ts, taskGroups.ts)
- **Ops:** `AgentPicker`, `CommentsSection`, `CreateTaskModal`, `KeyBadge`, `NewTaskRow`, `OverflowMenu`, `PriorityBadge`, `RunStateBadge`, `StatusBadge`, `TaskFilterBar`, `TaskInTool`, `TaskMetaSidebar`, `TaskPanel`, `TaskScheduleEditor`, `TaskSessionView`, `TaskViews`, `TasksList`, `TasksToolHeader`
- **Note:** Consumed by `hq`.

### 7. Automation & routines
- **Files (13):** `src/projects/` (AutomationLimitsForm.tsx, AutomationOverview.tsx, AutomationRoutines.tsx, AutomationRules.tsx, AutomationSwitch.tsx, AutomationTypes.ts, AutomationViewHeader.tsx); `src/tasks/` (RoutineForm.tsx, RoutineParts.tsx, RoutineRounds.tsx, RoutineRuleFields.tsx, RoutineSquares.tsx, RoutineWords.ts)
- **Ops:** `AutomationLimitsForm`, `AutomationOverview`, `AutomationRoutines`, `AutomationRules`, `AutomationSwitch`, `AutomationViewHeader`, `RoutineForm`, `RoutineRounds`, `RoutineRuleFields`, `RoutineSquares`, `RoutineWords`
- **Note:** Consumed by `hq`.

### 8. Projects, products & programs
- **Files (26):** `src/products/` (ProductCard.tsx, ProductDetailContent.tsx, ProductDetailHeader.tsx, ProductDetailTabs.tsx, ProductOverviewTab.tsx, ProductSettingsTab.tsx, ProductsListContent.tsx, index.ts, types.ts); `src/programs/` (ProgramCard.tsx, ProgramDetailContent.tsx, ProgramsListContent.tsx, index.ts, types.ts); `src/projects/` (FilesToolParts.tsx, PlaceCard.tsx, ProjectAgentsList.tsx, ProjectCard.tsx, ProjectHeader.tsx, ProjectPicker.tsx, ProjectProgressBar.tsx, ProjectStats.tsx, ProjectTabBar.tsx, fileListing.ts, index.ts, types.ts)
- **Ops:** `PlaceCard`, `ProjectAgentsList`, `ProjectCard`, `ProjectHeader`, `ProjectPicker`, `ProjectProgressBar`, `ProjectStats`, `ProjectTabBar`, `ProductCard`, `ProductDetailContent`, `ProductDetailHeader`, `ProductDetailTabs`, `ProductOverviewTab`, `ProductSettingsTab`, `ProductsListContent`, `ProgramCard`, `ProgramDetailContent`, `ProgramsListContent`
- **Note:** Consumed by `hq`.

### 9. People & dashboard
- **Files (24):** `src/dashboard/` (ActivityFeed.tsx, AgentCostList.tsx, DashboardLayout.tsx, FinancialOverview.tsx, RecentProjectsList.tsx, RunsOverview.tsx, SiteFilterBar.tsx, StatsCards.tsx, SystemLoadIndicator.tsx, TaskOverviewBar.tsx, TopAgentsList.tsx, index.ts, types.ts); `src/people/` (AddPeopleView.tsx, PersonAvatar.tsx, PersonProfileCardView.tsx, ProjectPeopleList.tsx, ProjectPersonView.tsx, ProjectPreviewView.tsx, RemovePersonView.tsx, index.ts, lastAdmin.ts, personLines.ts, types.ts)
- **Ops:** `AddPeopleView`, `PersonAvatar`, `PersonProfileCardView`, `ProjectPeopleList`, `ProjectPersonView`, `ProjectPreviewView`, `RemovePersonView`, `lastAdmin`, `ActivityFeed`, `AgentCostList`, `DashboardLayout`, `FinancialOverview`, `RecentProjectsList`, `RunsOverview`, `SiteFilterBar`, `StatsCards`, `SystemLoadIndicator`, `TaskOverviewBar`, `TopAgentsList`
- **Note:** `people/lastAdmin.ts` is the client-side guard against removing the last administrator (the server enforces it too). Consumed by `hq`.

### 10. Conversation transcript & replies
- **Files (19):** `src/sessions/` (ClosedConversationNotice.tsx, ConversationItems.tsx, ConversationMessages.tsx, FoldedLine.tsx, LiveReply.tsx, MemoryBar.tsx, ReplyActions.tsx, ReplyBlock.tsx, SessionTranscript.tsx, SessionUsageButton.tsx, WorkLineFold.tsx, conversationModel.ts, conversationRuntime.ts, mention.ts, socketHooks.ts, types.tsx, useConversationActions.ts, useLiveRun.ts, useStreamingText.ts)
- **Ops:** `ConversationItems`, `ConversationMessages`, `LiveReply`, `ReplyActions`, `ReplyBlock`, `SessionTranscript`, `WorkLineFold`, `FoldedLine`, `MemoryBar`, `SessionUsageButton`, `ClosedConversationNotice`, `useConversationActions`, `useLiveRun`, `useStreamingText`
- **Note:** Consumed by `hq`.

### 11. Chat panel, task sessions & approvals
- **Files (17):** `src/sessions/` (ApprovalCard.tsx, ChatPanel.tsx, ConfirmDialog.tsx, ConversationPopup.tsx, FloatingPanel.tsx, ManifestApprovalBubble.tsx, ManifestApprovalComment.tsx, PanelActivityList.tsx, PanelActivitySession.tsx, PanelChatComposer.tsx, PanelChatHeader.tsx, PanelChatView.tsx, PanelSessionList.tsx, SessionComponents.tsx, TaskSessionSection.tsx, index.ts, panelChatViewTypes.ts)
- **Ops:** `ApprovalCard`, `ManifestApprovalBubble`, `ManifestApprovalComment`, `ConfirmDialog`, `ChatPanel`, `ConversationPopup`, `FloatingPanel`, `PanelActivityList`, `PanelActivitySession`, `PanelChatComposer`, `PanelChatHeader`, `PanelChatView`, `PanelSessionList`, `TaskSessionSection`
- **Note:** The approval cards carry the person's answer to a security prompt, so what they word and send matters. Consumed by `hq`.

### 12. File viewing & diff
- **Files (26):** `src/files/` (FileFrame.tsx, FileFrameParts.tsx, RendererHost.tsx, fileBytes.ts, frameStates.ts, index.ts, kindLabel.ts, readFailure.ts, registry.ts, renderer.ts); `src/files/diff/` (ChangesList.tsx, FileDiff.tsx, changeMarker.tsx, diffLines.ts, index.ts); `src/files/renderers/code/` (codeLanguages.ts, codeRenderer.tsx); `src/files/renderers/image/` (imageRenderer.tsx); `src/files/renderers/json/` (JsonTree.tsx, jsonProblem.ts, jsonRenderer.tsx); `src/files/renderers/markdown/` (markdownRenderer.tsx); `src/files/renderers/pdf/` (pdfRenderer.tsx); `src/files/renderers/table/` (parseCsv.ts, tableRenderer.tsx); `src/files/renderers/text/` (textRenderer.tsx, useTextFile.ts)
- **Ops:** `FileFrame`, `RendererHost`, the renderer registry (`registry.ts`, `renderer.ts`), `codeRenderer`, `imageRenderer`, `jsonRenderer`, `JsonTree`, `markdownRenderer`, `pdfRenderer`, `tableRenderer`, `parseCsv`, `textRenderer`, `FileDiff`, `ChangesList`, `diffLines`, `readFailure`, `kindLabel`
- **Note:** Renders file content from outside the platform (Markdown, PDF, images): check that nothing it shows can run script or load remote content. Consumed by `hq`, `console-web`.

## Excluded from all domains

Test files (`*.test.ts`, `*.test.tsx`) and test support (`src/files/__tests__/testKit.tsx`); build and package configuration (`.gitignore`, `AGENTS.md`, `CLAUDE.md`, `DESIGN-SYSTEM.md`, `package-lock.json`, `package.json`, `tsconfig.json`, `vitest.config.ts`, `vitest.setup.ts`); `node_modules/` and `dist/`. `AGENTS.md`, `CLAUDE.md` and `DESIGN-SYSTEM.md` are documentation, not source.
