import { describe, it, expect } from 'vitest';
import { classifyDirectorIntent } from '../services/directorIntentService.js';

describe('DirectorIntentService', () => {
  // ---------------------------------------------------------------------------
  // Generation cases
  // ---------------------------------------------------------------------------

  it('classifies "Create a 5-card carousel about self-improvement" as generation', () => {
    const result = classifyDirectorIntent('Create a 5-card carousel about self-improvement');
    expect(result.mode).toBe('generation');
    expect(result.confidence).toBe('high');
    expect(result.generationHint?.artifactType).toBe('carousel');
    expect(result.generationHint?.requestedCardCount).toBe(5);
    expect(result.generationHint?.rawTopic).toBeTruthy();
  });

  it('classifies "Make a post about focus" as generation', () => {
    const result = classifyDirectorIntent('Make a post about focus');
    expect(result.mode).toBe('generation');
    expect(result.confidence).toBe('high');
    expect(result.generationHint?.artifactType).toBe('post');
  });

  it('classifies "Generate a background for this" as generation', () => {
    const result = classifyDirectorIntent('Generate a background for this');
    expect(result.mode).toBe('generation');
    expect(result.confidence).toBe('high');
  });

  it('classifies "Turn this into a carousel" as generation', () => {
    const result = classifyDirectorIntent('Turn this into a carousel');
    expect(result.mode).toBe('generation');
    expect(result.confidence).toBe('medium');
    expect(result.generationHint?.artifactType).toBe('carousel');
  });

  it('classifies "Create the final design" as generation', () => {
    const result = classifyDirectorIntent('Create the final design');
    expect(result.mode).toBe('generation');
    expect(result.confidence).toBe('high');
  });

  it('classifies "Build the final card" as generation', () => {
    const result = classifyDirectorIntent('Build the final card');
    expect(result.mode).toBe('generation');
    expect(result.confidence).toBe('high');
  });

  it('classifies "Design a carousel" as generation', () => {
    const result = classifyDirectorIntent('Design a carousel');
    expect(result.mode).toBe('generation');
    expect(result.confidence).toBe('high');
    expect(result.generationHint?.artifactType).toBe('carousel');
  });

  it('classifies "Draft a post" as generation', () => {
    const result = classifyDirectorIntent('Draft a post');
    expect(result.mode).toBe('generation');
    expect(result.confidence).toBe('high');
    expect(result.generationHint?.artifactType).toBe('post');
  });

  it('classifies "Make 3 cards about productivity" as generation with card count', () => {
    const result = classifyDirectorIntent('Make 3 cards about productivity');
    expect(result.mode).toBe('generation');
    expect(result.generationHint?.artifactType).toBe('carousel');
    expect(result.generationHint?.requestedCardCount).toBe(3);
  });

  it('classifies "Make 10 slides about habits" as generation with card count', () => {
    const result = classifyDirectorIntent('Make 10 slides about habits');
    expect(result.mode).toBe('generation');
    expect(result.generationHint?.artifactType).toBe('carousel');
    expect(result.generationHint?.requestedCardCount).toBe(10);
  });

  // ---------------------------------------------------------------------------
  // Conversation cases
  // ---------------------------------------------------------------------------

  it('classifies "What do you think about this idea?" as conversation', () => {
    const result = classifyDirectorIntent('What do you think about this idea?');
    expect(result.mode).toBe('conversation');
    expect(result.confidence).toBe('high');
    expect(result.generationHint).toBeUndefined();
  });

  it('classifies "Help me brainstorm hooks" as conversation', () => {
    const result = classifyDirectorIntent('Help me brainstorm hooks');
    expect(result.mode).toBe('conversation');
    expect(result.confidence).toBe('high');
  });

  it('classifies "I want to discuss the style first" as conversation', () => {
    const result = classifyDirectorIntent('I want to discuss the style first');
    expect(result.mode).toBe('conversation');
    expect(result.confidence).toBe('high');
  });

  it('classifies "Can you explain carousel structure?" as conversation', () => {
    const result = classifyDirectorIntent('Can you explain carousel structure?');
    expect(result.mode).toBe('conversation');
    expect(result.confidence).toBe('high');
  });

  it('classifies "Give me ideas" as conversation', () => {
    const result = classifyDirectorIntent('Give me ideas');
    expect(result.mode).toBe('conversation');
    expect(result.confidence).toBe('high');
  });

  it('classifies "Tell me about color theory" as conversation', () => {
    const result = classifyDirectorIntent('Tell me about color theory');
    expect(result.mode).toBe('conversation');
    expect(result.confidence).toBe('high');
  });

  it('classifies "How do I change fonts?" as conversation', () => {
    const result = classifyDirectorIntent('How do I change fonts?');
    expect(result.mode).toBe('conversation');
    expect(result.confidence).toBe('high');
  });

  it('classifies "Your thoughts on this palette" as conversation', () => {
    const result = classifyDirectorIntent('Your thoughts on this palette');
    expect(result.mode).toBe('conversation');
    expect(result.confidence).toBe('high');
  });

  // ---------------------------------------------------------------------------
  // Ambiguous cases
  // ---------------------------------------------------------------------------

  it('classifies "make this better" as generation because "make" is a strong keyword', () => {
    const result = classifyDirectorIntent('make this better');
    expect(result.mode).toBe('generation');
    expect(result.confidence).toBe('high');
  });

  it('classifies "ok" as conversation with low confidence', () => {
    const result = classifyDirectorIntent('ok');
    expect(result.mode).toBe('conversation');
    expect(result.confidence).toBe('low');
  });

  it('classifies "sure" as conversation with low confidence', () => {
    const result = classifyDirectorIntent('sure');
    expect(result.mode).toBe('conversation');
    expect(result.confidence).toBe('low');
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  it('handles empty string as conversation low confidence', () => {
    const result = classifyDirectorIntent('');
    expect(result.mode).toBe('conversation');
    expect(result.confidence).toBe('low');
  });

  it('extracts topic from "Create a post about morning routines"', () => {
    const result = classifyDirectorIntent('Create a post about morning routines');
    expect(result.mode).toBe('generation');
    expect(result.generationHint?.rawTopic).toBe('morning routines');
  });

  it('extracts topic from "Make a carousel on focus and discipline"', () => {
    const result = classifyDirectorIntent('Make a carousel on focus and discipline');
    expect(result.mode).toBe('generation');
    expect(result.generationHint?.rawTopic).toBe('focus and discipline');
  });
});
