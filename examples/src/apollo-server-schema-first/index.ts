import { ApolloServer, gql } from 'apollo-server';
import { GraphQLRequestContext } from 'apollo-server-plugin-base';
import {
  UnauthorizedError,
  authZApolloPlugin,
  preExecRule,
  postExecRule,
  AuthZDirectiveVisitor
} from '@astrumu/graphql-authz';

const typeDefs = gql`
  type User {
    id: ID!
    username: String!
    email: String! @authz(rules: [IsAdmin])
    posts: [Post!]!
  }

  type Post @authz(rules: [CanReadPost]) {
    id: ID!
    title: String!
    body: String!
    status: Status!
    author: User!
  }

  enum Status {
    draft
    public
  }

  type Query {
    users: [User!]! @authz(rules: [IsAuthenticated])
    posts: [Post!]!
    post(id: ID!): Post
  }

  type Mutation {
    publishPost(postId: ID!): Post! @authz(rules: [CanPublishPost])
  }

  enum AuthZRules {
    IsAuthenticated
    IsAdmin
    CanReadPost
    CanPublishPost
  }

  # this is a common boilerplate
  input AuthZDirectiveCompositeRulesInput {
    and: [AuthZRules]
    or: [AuthZRules]
    not: AuthZRules
  }

  # this is a common boilerplate
  input AuthZDirectiveDeepCompositeRulesInput {
    id: AuthZRules
    and: [AuthZDirectiveDeepCompositeRulesInput]
    or: [AuthZDirectiveDeepCompositeRulesInput]
    not: AuthZDirectiveDeepCompositeRulesInput
  }

  # this is a common boilerplate
  directive @authz(
    rules: [AuthZRules]
    compositeRules: [AuthZDirectiveCompositeRulesInput]
    deepCompositeRules: [AuthZDirectiveDeepCompositeRulesInput]
  ) on FIELD_DEFINITION | OBJECT | INTERFACE
`;

const users = [
  {
    id: '1',
    username: 'user01',
    email: 'user01@gmail.com',
    role: 'Customer'
  },
  {
    id: '2',
    username: 'user02',
    email: 'user02@gmail.com',
    role: 'Admin'
  }
];

const posts = [
  {
    id: '1',
    title: 'Post01 title',
    body: 'Post01 body',
    status: 'draft',
    authorId: '1'
  },
  {
    id: '2',
    title: 'Post02 title',
    body: 'Post02 body',
    status: 'public',
    authorId: '1'
  }
];

const resolvers = {
  Query: {
    users: () => users,
    posts: () => posts,
    post: (parent: unknown, args: { id: string }) =>
      posts.find(({ id }) => id === args.id)
  },
  Mutation: {
    publishPost: (parent: unknown, args: { postId: string }) => {
      const post = posts.find(({ id }) => id === args.postId);
      if (!post) {
        throw new Error('Not Found');
      }
      post.status = 'public';
      return post;
    }
  },
  Post: {
    author: (parent: { authorId: string }) =>
      users.find(({ id }) => id === parent.authorId)
  }
};

const IsAuthenticated = preExecRule({
  error: new UnauthorizedError('User is not authenticated')
})((requestContext: GraphQLRequestContext) => !!requestContext.context.user);

const IsAdmin = preExecRule({
  error: new UnauthorizedError('User is not admin')
})(
  (requestContext: GraphQLRequestContext) =>
    requestContext.context.user?.role === 'Admin'
);

const CanReadPost = postExecRule({
  error: new UnauthorizedError('Access denied'),
  selectionSet: '{ status author { id } }'
})(
  (
    requestContext: GraphQLRequestContext,
    fieldArgs: unknown,
    post: { status: string; author: { id: string } }
  ) =>
    post.status === 'public' ||
    requestContext.context.user?.id === post.author.id
);

const CanPublishPost = preExecRule()(
  async (
    requestContext: GraphQLRequestContext,
    fieldArgs: { postId: string }
  ) => {
    const post = await Promise.resolve(
      posts.find(({ id }) => id === fieldArgs.postId)
    );
    return !post || post.authorId === requestContext.context.user?.id;
  }
);

const authZRules = {
  IsAuthenticated,
  IsAdmin,
  CanReadPost,
  CanPublishPost
} as const;

const server = new ApolloServer({
  typeDefs,
  resolvers,
  plugins: [authZApolloPlugin(authZRules)],
  schemaDirectives: { authz: AuthZDirectiveVisitor },
  context: ({ req }) => ({
    user: users.find(({ id }) => id === req.get('x-user-id')) || null
  })
});

server.listen().then(({ url }) => {
  console.log(`🚀  Server ready at ${url}`);
});