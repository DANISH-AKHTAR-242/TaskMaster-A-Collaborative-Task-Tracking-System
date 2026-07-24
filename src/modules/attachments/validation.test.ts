import { validateAttachment } from './validation.js';
describe('attachment validation', () => {
  it('rejects oversized and executable inputs', () => {
    expect(() => {
      validateAttachment('application/pdf', 26, 25);
    }).toThrow();
    expect(() => {
      validateAttachment('application/x-msdownload', 1, 25);
    }).toThrow();
    expect(() => {
      validateAttachment('application/pdf', 25, 25);
    }).not.toThrow();
  });
});
