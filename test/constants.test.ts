import { describe, it, expect } from 'vitest';
import { SECTION_COLORS, SECTIONS, getSectionColor, getSectionById, getSectionTailwindTextColor, getSectionTailwindBorderColor } from '@/constants';

describe('Section Constants', () => {
  it('should have consistent section colors', () => {
    // Verify that SECTIONS array contains all expected sections
    expect(SECTIONS).toHaveLength(4);

    // Verify that each section has the correct color mapping
    SECTIONS.forEach(section => {
      expect(SECTION_COLORS[section.id]).toBeDefined();
      expect(section.color).toBe(SECTION_COLORS[section.id]);
    });
  });

  it('should have correct color values for each section', () => {
    expect(SECTION_COLORS['ai-config']).toBe('#6366f1');      // Blue
    expect(SECTION_COLORS['theme-generator']).toBe('#a855f7'); // Purple
    expect(SECTION_COLORS['theme-library']).toBe('#16a344');   // Green
    expect(SECTION_COLORS['logs']).toBe('#6b7280');           // Gray
  });

  it('should have correct section definitions', () => {
    const aiConfigSection = getSectionById('ai-config');
    expect(aiConfigSection).toBeDefined();
    expect(aiConfigSection?.id).toBe('ai-config');
    expect(aiConfigSection?.title).toBe('AI Configuration');
    expect(aiConfigSection?.icon).toBe('BrainCircuit');
    expect(aiConfigSection?.color).toBe('#6366f1');
    expect(aiConfigSection?.tailwindTextColor).toBe('text-blue-400');
    expect(aiConfigSection?.tailwindBorderColor).toBe('border-blue-500/30');

    const themeGeneratorSection = getSectionById('theme-generator');
    expect(themeGeneratorSection).toBeDefined();
    expect(themeGeneratorSection?.id).toBe('theme-generator');
    expect(themeGeneratorSection?.title).toBe('Theme Generator');
    expect(themeGeneratorSection?.icon).toBe('Wand');
    expect(themeGeneratorSection?.color).toBe('#a855f7');
    expect(themeGeneratorSection?.tailwindTextColor).toBe('text-purple-400');
    expect(themeGeneratorSection?.tailwindBorderColor).toBe('border-purple-500/30');

    const themeLibrarySection = getSectionById('theme-library');
    expect(themeLibrarySection).toBeDefined();
    expect(themeLibrarySection?.id).toBe('theme-library');
    expect(themeLibrarySection?.title).toBe('Theme Library');
    expect(themeLibrarySection?.icon).toBe('Palette');
    expect(themeLibrarySection?.color).toBe('#16a344');
    expect(themeLibrarySection?.tailwindTextColor).toBe('text-green-400');
    expect(themeLibrarySection?.tailwindBorderColor).toBe('border-green-500/30');

    const logsSection = getSectionById('logs');
    expect(logsSection).toBeDefined();
    expect(logsSection?.id).toBe('logs');
    expect(logsSection?.title).toBe('Activity Logs');
    expect(logsSection?.icon).toBe('FileText');
    expect(logsSection?.color).toBe('#6b7280');
    expect(logsSection?.tailwindTextColor).toBe('text-gray-400');
    expect(logsSection?.tailwindBorderColor).toBe('border-gray-500/30');
  });

  it('should return correct color for each section ID', () => {
    expect(getSectionColor('ai-config')).toBe('#6366f1');
    expect(getSectionColor('theme-generator')).toBe('#a855f7');
    expect(getSectionColor('theme-library')).toBe('#16a344');
    expect(getSectionColor('logs')).toBe('#6b7280');
  });

  it('should return correct tailwind text color for each section ID', () => {
    expect(getSectionTailwindTextColor('ai-config')).toBe('text-blue-400');
    expect(getSectionTailwindTextColor('theme-generator')).toBe('text-purple-400');
    expect(getSectionTailwindTextColor('theme-library')).toBe('text-green-400');
    expect(getSectionTailwindTextColor('logs')).toBe('text-gray-400');
  });

  it('should return correct tailwind border color for each section ID', () => {
    expect(getSectionTailwindBorderColor('ai-config')).toBe('border-blue-500/30');
    expect(getSectionTailwindBorderColor('theme-generator')).toBe('border-purple-500/30');
    expect(getSectionTailwindBorderColor('theme-library')).toBe('border-green-500/30');
    expect(getSectionTailwindBorderColor('logs')).toBe('border-gray-500/30');
  });
});
