/**
 * Rough token count for a prompt-sized string.
 *
 * The client ships no tokenizer, so this is the same chars/4 approximation the
 * server falls back to — which is why every label that shows it is prefixed
 * with `~`. Lives here rather than beside one route because both the skill
 * editor's body and the agent editor's system prompt display it.
 */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
