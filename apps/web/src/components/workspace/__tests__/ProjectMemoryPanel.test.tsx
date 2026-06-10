// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ProjectMemoryPanel from '../ProjectMemoryPanel';
import type { ProjectContextMemoryDto } from '../../../api/types';

const mockMemory: ProjectContextMemoryDto = {
  projectId: 'proj-1',
  topic: 'fitness routines',
  audience: 'gym goers',
  tone: 'energetic',
  platform: 'Instagram',
  slideCount: 5,
  visualDirection: 'bold and dynamic',
  approvedDirection: 'Use strong contrast',
  rejectedIdeas: ['soft pastel colors'],
  constraints: ['no text on images'],
  summary: 'A fitness carousel',
  updatedAt: '2026-06-01T00:00:00Z',
};

function openPanel(container: HTMLElement) {
  const btn = container.querySelector('button')!;
  fireEvent.click(btn);
}

describe('ProjectMemoryPanel', () => {
  it('renders the "Project memory" button', () => {
    const { container } = render(
      <ProjectMemoryPanel memory={null} loading={false} error={null} />,
    );
    expect(container.querySelector('button')).not.toBeNull();
    expect(screen.getByTitle('Project memory')).not.toBeNull();
  });

  it('shows no-memory state when memory is null', () => {
    const { container } = render(
      <ProjectMemoryPanel memory={null} loading={false} error={null} />,
    );
    openPanel(container);
    expect(screen.getByText(/No project memory yet/)).not.toBeNull();
  });

  it('no-memory message says it will build as you chat', () => {
    const { container } = render(
      <ProjectMemoryPanel memory={null} loading={false} error={null} />,
    );
    openPanel(container);
    expect(screen.getByText(/It will build as you chat/)).not.toBeNull();
  });

  it('shows loading text when loading=true', () => {
    const { container } = render(
      <ProjectMemoryPanel memory={null} loading={true} error={null} />,
    );
    openPanel(container);
    expect(screen.getByText(/Loading project memory/)).not.toBeNull();
  });

  it('shows error text when error is set', () => {
    const { container } = render(
      <ProjectMemoryPanel memory={null} loading={false} error="API failure" />,
    );
    openPanel(container);
    expect(screen.getByText(/Could not load project memory/)).not.toBeNull();
  });

  it('renders topic field when memory has topic', () => {
    const { container } = render(
      <ProjectMemoryPanel memory={mockMemory} loading={false} error={null} />,
    );
    openPanel(container);
    expect(screen.getByText('fitness routines')).not.toBeNull();
  });

  it('renders platform field when memory has platform', () => {
    const { container } = render(
      <ProjectMemoryPanel memory={mockMemory} loading={false} error={null} />,
    );
    openPanel(container);
    expect(screen.getByText('Instagram')).not.toBeNull();
  });

  it('renders tone field when memory has tone', () => {
    const { container } = render(
      <ProjectMemoryPanel memory={mockMemory} loading={false} error={null} />,
    );
    openPanel(container);
    expect(screen.getByText('energetic')).not.toBeNull();
  });

  it('renders constraints and rejected ideas combined', () => {
    const { container } = render(
      <ProjectMemoryPanel memory={mockMemory} loading={false} error={null} />,
    );
    openPanel(container);
    expect(screen.getByText(/soft pastel colors/)).not.toBeNull();
    expect(screen.getByText(/no text on images/)).not.toBeNull();
  });

  it('does not render edit controls', () => {
    const { container } = render(
      <ProjectMemoryPanel memory={mockMemory} loading={false} error={null} />,
    );
    openPanel(container);
    const inputs = container.querySelectorAll('input, textarea');
    expect(inputs).toHaveLength(0);
  });

  it('shows updated date when memory is present', () => {
    const { container } = render(
      <ProjectMemoryPanel memory={mockMemory} loading={false} error={null} />,
    );
    openPanel(container);
    expect(screen.getByText(/Updated/)).not.toBeNull();
  });

  it('panel heading reads "Project memory" not "AI knows you"', () => {
    const { container } = render(
      <ProjectMemoryPanel memory={mockMemory} loading={false} error={null} />,
    );
    openPanel(container);
    expect(screen.queryByText(/AI knows you/)).toBeNull();
    expect(screen.getAllByText('Project memory').length).toBeGreaterThan(0);
  });
});
