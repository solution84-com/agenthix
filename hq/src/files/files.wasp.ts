import { action, query, type Spec } from "@wasp.sh/spec";
import { openFileAction as openFile, openFilesAction as openFiles, openTaskAttachmentAction as openTaskAttachment, getFileFactsQuery as getFileFacts, getTaskReferenceFactsQuery as getTaskReferenceFacts } from "./operations" with { type: "ref" };

export const filesSpec: Spec = [
    // Opening a file (adr-0153): access, the site's facts, the kind, and tickets on the site's relay, each recorded.
    action(openFile),
    // Every file embedded on a screen in one request, each through the same open.
    action(openFiles),
    // A task's attachment, kept by hq and served by hq's relay, opened the same way.
    action(openTaskAttachment),
    // What chips show of the files they name: access and the site's facts, with no ticket and no record.
    query(getFileFacts),
    // What chips naming a task or one of its files show: the task's access, its facts, the file's facts; nothing signed.
    query(getTaskReferenceFacts),
];
