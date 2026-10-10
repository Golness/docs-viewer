// Quick test to see what ctx.llm.listProviders() returns
// Run this in the DSH developer console or as a plugin

console.log('Testing LLM service...');

try {
  // This is what the plugin does
  const providers = await ctx.llm.listProviders();
  console.log('Providers type:', typeof providers);
  console.log('Is array:', Array.isArray(providers));
  console.log('Providers:', JSON.stringify(providers, null, 2));
  
  if (Array.isArray(providers) && providers.length > 0) {
    console.log('First provider:', providers[0]);
    console.log('First provider id:', providers[0].id);
    console.log('First provider name:', providers[0].name);
    
    // Try to get models for the first provider
    const providerId = providers[0].id || providers[0].name;
    if (providerId) {
      const models = await ctx.llm.listModels(providerId);
      console.log('Models for', providerId, ':', JSON.stringify(models, null, 2));
    }
  }
} catch (e) {
  console.error('Error:', e.message);
  console.error('Stack:', e.stack);
}