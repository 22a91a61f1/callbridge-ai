import { VapiService } from '../server/telephony/vapiService';

async function runTest() {
  console.log('========================================================================');
  console.log('TESTING VAPI OUTBOUND CALL PAYLOAD STRUCTURE');
  console.log('========================================================================\n');

  let interceptedBodies: any[] = [];
  const originalFetch = global.fetch;

  // Intercept fetch to inspect request body before transmission
  (global as any).fetch = async (url: string, init?: any) => {
    if (url.includes('/call/phone')) {
      const parsedBody = JSON.parse(init.body);
      interceptedBodies.push(parsedBody);
      return {
        ok: true,
        status: 201,
        json: async () => ({
          id: `vapi_call_${Date.now()}`,
          phoneCallProviderId: 'CA_test_sid_12345',
          status: 'queued',
          monitor: {
            controlUrl: 'https://vapi-monitor.example.com/control',
            controlAuthenticationEnabled: true,
          },
        }),
      } as any;
    }
    return originalFetch(url, init);
  };

  try {
    // Set runtime credentials without assistantId (ephemeral assistant mode)
    VapiService.setRuntimeConfig(
      'test-vapi-key-12345',
      'phone-id-test-123',
      ''
    );

    // Test Case 1: Ephemeral inline assistant (no assistantId provided)
    console.log('--- Test Case 1: Ephemeral Inline Assistant ---');
    await VapiService.createOutboundCall({
      phoneNumber: '+919876543210',
      contactName: 'Test Respondent 1',
      voiceId: 'Txde0pZ5tVhXE6HUspcf',
      script: 'నమస్కారం! ఇది పరీక్షా సందేశం.',
      language: 'te',
      moduleType: 'political_campaign',
      appBaseUrl: 'https://callbridge.example.com',
    });

    const body1 = interceptedBodies[0];
    console.log('Root keys present in Case 1:', Object.keys(body1));

    if ('serverUrl' in body1) {
      throw new Error('FAIL: root-level serverUrl exists in Case 1 request body!');
    }
    console.log('[PASS] Test 1.1: Root level does NOT contain serverUrl');

    if ('serverMessages' in body1) {
      throw new Error('FAIL: root-level serverMessages exists in Case 1 request body!');
    }
    console.log('[PASS] Test 1.2: Root level does NOT contain serverMessages');

    if (!body1.assistant) {
      throw new Error('FAIL: body.assistant is missing in Case 1!');
    }
    console.log('[PASS] Test 1.3: body.assistant is present');

    if (body1.assistant.serverUrl !== 'https://callbridge.example.com/api/callbridge/vapi/webhook') {
      throw new Error(`FAIL: expected assistant.serverUrl to be webhook, got: ${body1.assistant.serverUrl}`);
    }
    console.log('[PASS] Test 1.4: assistant.serverUrl correctly populated inside assistant');

    if (!Array.isArray(body1.assistant.serverMessages) || !body1.assistant.serverMessages.includes('status-update')) {
      throw new Error('FAIL: assistant.serverMessages missing or invalid');
    }
    console.log('[PASS] Test 1.5: assistant.serverMessages correctly populated inside assistant');

    // Test Case 2: Outbound call with assistantId and assistantOverrides
    console.log('\n--- Test Case 2: assistantId with assistantOverrides ---');
    VapiService.setRuntimeConfig(
      'test-vapi-key-12345',
      'phone-id-test-123',
      'asst_uuid_98765'
    );

    await VapiService.createOutboundCall({
      phoneNumber: '+919876543211',
      contactName: 'Test Respondent 2',
      voiceId: 'Txde0pZ5tVhXE6HUspcf',
      script: 'నమస్కారం! ఇది రెండవ పరీక్ష.',
      language: 'te',
      moduleType: 'political_survey',
      appBaseUrl: 'https://callbridge.example.com',
    });

    const body2 = interceptedBodies[1];
    console.log('Root keys present in Case 2:', Object.keys(body2));

    if ('serverUrl' in body2) {
      throw new Error('FAIL: root-level serverUrl exists in Case 2 request body!');
    }
    console.log('[PASS] Test 2.1: Root level does NOT contain serverUrl');

    if ('serverMessages' in body2) {
      throw new Error('FAIL: root-level serverMessages exists in Case 2 request body!');
    }
    console.log('[PASS] Test 2.2: Root level does NOT contain serverMessages');

    if (body2.assistantId !== 'asst_uuid_98765') {
      throw new Error(`FAIL: body.assistantId is incorrect: ${body2.assistantId}`);
    }
    console.log('[PASS] Test 2.3: body.assistantId is present');

    if (!body2.assistantOverrides) {
      throw new Error('FAIL: body.assistantOverrides is missing in Case 2!');
    }
    console.log('[PASS] Test 2.4: body.assistantOverrides is present');

    if (body2.assistantOverrides.serverUrl !== 'https://callbridge.example.com/api/callbridge/vapi/webhook') {
      throw new Error(`FAIL: expected assistantOverrides.serverUrl to be webhook, got: ${body2.assistantOverrides.serverUrl}`);
    }
    console.log('[PASS] Test 2.5: assistantOverrides.serverUrl correctly populated inside overrides');

    if (!Array.isArray(body2.assistantOverrides.serverMessages) || !body2.assistantOverrides.serverMessages.includes('status-update')) {
      throw new Error('FAIL: assistantOverrides.serverMessages missing or invalid');
    }
    console.log('[PASS] Test 2.6: assistantOverrides.serverMessages correctly populated inside overrides');

    // Root key whitelist check
    const allowedRootKeys = new Set(['phoneNumberId', 'customer', 'assistant', 'assistantId', 'assistantOverrides', 'metadata']);
    for (const key of Object.keys(body1)) {
      if (!allowedRootKeys.has(key)) {
        throw new Error(`FAIL: Unauthorized root key found in Case 1: ${key}`);
      }
    }
    for (const key of Object.keys(body2)) {
      if (!allowedRootKeys.has(key)) {
        throw new Error(`FAIL: Unauthorized root key found in Case 2: ${key}`);
      }
    }
    console.log('[PASS] Test 2.7: Both requests strictly adhere to Vapi CreateOutboundCallDTO schema');

    console.log('\n========================================================================');
    console.log('ALL VAPI PAYLOAD TESTS PASSED! Root-level error is completely resolved.');
    console.log('========================================================================');
  } finally {
    global.fetch = originalFetch;
  }
}

runTest().catch((err) => {
  console.error('[TEST_FAILURE]', err);
  process.exit(1);
});
