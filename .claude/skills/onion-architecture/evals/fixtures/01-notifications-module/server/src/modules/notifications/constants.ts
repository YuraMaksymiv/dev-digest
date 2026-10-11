import { z } from 'zod';

export const NOTIFY_CHANNELS = ['slack', 'email'] as const;
export type NotifyChannel = (typeof NOTIFY_CHANNELS)[number];

export const NotifyInput = z.object({ channel: z.enum(NOTIFY_CHANNELS) });
export type NotifyInput = z.infer<typeof NotifyInput>;

export const GITHUB_TOKEN_SECRET = 'github_token';
export const TEMPLATE_DIR = 'templates/notifications';
