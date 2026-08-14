import { describe, it, expect, afterEach } from "vitest";
import { verifyIntegrationApiKey, integrationError, IntegrationAuthError } from "@/lib/integrations/auth";

const ENV_VAR = "TEST_INTEGRATION_API_KEY";

function req(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/integrations/whatever", { headers });
}

afterEach(() => {
  delete process.env[ENV_VAR];
});

describe("verifyIntegrationApiKey", () => {
  it("бросает 401, если заголовок X-Api-Key отсутствует", () => {
    process.env[ENV_VAR] = "secret";
    expect(() => verifyIntegrationApiKey(req(), ENV_VAR)).toThrow(IntegrationAuthError);
    try {
      verifyIntegrationApiKey(req(), ENV_VAR);
    } catch (err) {
      expect((err as IntegrationAuthError).status).toBe(401);
    }
  });

  it("бросает 401, если переменная окружения не задана вовсе", () => {
    // env var не установлена — даже если кто-то пришлёт заголовок, сверять не с чем.
    expect(() => verifyIntegrationApiKey(req({ "x-api-key": "anything" }), ENV_VAR)).toThrow(
      IntegrationAuthError
    );
  });

  it("бросает 401 при неверном ключе той же длины", () => {
    process.env[ENV_VAR] = "correct-secret-1234";
    expect(() =>
      verifyIntegrationApiKey(req({ "x-api-key": "wrong---secret-1234" }), ENV_VAR)
    ).toThrow(IntegrationAuthError);
  });

  it("бросает 401 при ключе другой длины (не должно падать с runtime-ошибкой timingSafeEqual)", () => {
    process.env[ENV_VAR] = "a-fairly-long-secret-value";
    expect(() => verifyIntegrationApiKey(req({ "x-api-key": "short" }), ENV_VAR)).toThrow(
      IntegrationAuthError
    );
  });

  it("не бросает исключение при верном ключе", () => {
    process.env[ENV_VAR] = "correct-secret-1234";
    expect(() =>
      verifyIntegrationApiKey(req({ "x-api-key": "correct-secret-1234" }), ENV_VAR)
    ).not.toThrow();
  });
});

describe("integrationError", () => {
  it("превращает IntegrationAuthError в Response с тем же статусом", async () => {
    const res = integrationError(new IntegrationAuthError(401, "unauthorized"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("превращает произвольную ошибку в 500 internal_error, не пробрасывая детали", async () => {
    const res = integrationError(new Error("какая-то внутренняя деталь БД"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("internal_error");
    expect(JSON.stringify(body)).not.toContain("внутренняя деталь");
  });
});
