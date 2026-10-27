export async function resolveAuthenticatedCharacter({ isRegister, result, fetchCharacter }) {
    if (isRegister && result.user?.character) return result.user.character;
    const response = await fetchCharacter(result.token);
    return response.character;
}
