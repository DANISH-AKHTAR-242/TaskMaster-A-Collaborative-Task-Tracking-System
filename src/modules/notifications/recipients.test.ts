import { notificationRecipients } from './recipients.js';
describe('notification recipients', () => {
  it('removes the actor and duplicates', () => {
    expect(notificationRecipients('a', ['b', 'a', 'b', 'c'])).toEqual(['b', 'c']);
  });
});
