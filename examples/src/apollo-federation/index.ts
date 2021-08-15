import { ApolloServer } from 'apollo-server';
import { ApolloGateway } from '@apollo/gateway';
import { authZApolloPlugin } from '@astrumu/graphql-authz';

import { authZRules } from './rules';

const gateway = new ApolloGateway({
  serviceList: [
    { name: 'users', url: 'http://localhost:4001/graphql' },
    { name: 'posts', url: 'http://localhost:4002/graphql' }
  ]
});

const authSchema = {
  Post: { __authz: { rules: ['CanReadPost'] } },
  User: {
    email: { __authz: { rules: ['IsAdmin'] } }
  },
  Mutation: {
    publishPost: { __authz: { rules: ['CanPublishPost'] } }
  },
  Query: {
    users: { __authz: { rules: ['IsAuthenticated'] } }
  }
};

function bootstrap() {
  const server = new ApolloServer({
    gateway,
    subscriptions: false,
    plugins: [authZApolloPlugin({ rules: authZRules, authSchema })],
    context: ({ req }) => {
      const userId = req.get('x-user-id');
      return {
        user: userId ? { id: req.get('x-user-id') } : null
      };
    }
  });

  return server.listen().then(({ url }) => {
    console.log(`🚀 Server ready at ${url}`);
  });
}

bootstrap();