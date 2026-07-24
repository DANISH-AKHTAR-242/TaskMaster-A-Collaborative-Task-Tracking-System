import { notFound } from '../../shared/errors/app-error.js';
import { toUserDto, type UserDto } from './dto.js';
import type { UserRepository } from './repository.js';

export class UserService {
  public constructor(private readonly users: UserRepository) {}

  public async me(userId: string): Promise<UserDto> {
    const user = await this.users.findActiveById(userId);
    if (user === null) throw notFound();
    return toUserDto(user);
  }

  public async update(
    userId: string,
    input: { displayName?: string; avatarUrl?: string | null },
  ): Promise<UserDto> {
    await this.me(userId);
    return toUserDto(await this.users.updateProfile(userId, input));
  }
}
