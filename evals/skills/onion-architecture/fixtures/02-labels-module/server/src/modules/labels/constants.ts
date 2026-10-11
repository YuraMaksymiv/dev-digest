import { z } from 'zod';

export const MAX_LABELS = 20;
export const MAX_LABEL_LENGTH = 40;

export const ReplaceLabelsInput = z.object({ labels: z.array(z.string()).max(100) });
export type ReplaceLabelsInput = z.infer<typeof ReplaceLabelsInput>;
